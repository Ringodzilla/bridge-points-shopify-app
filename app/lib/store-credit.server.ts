import prisma from "../db.server";

type AdminGraphqlClient = {
  graphql: (
    operation: string,
    options?: {
      variables?: Record<string, unknown>;
    },
  ) => Promise<Response>;
};

type Money = {
  amount: string;
  currencyCode: string;
};

type CustomerMatch = {
  id: string;
  displayName: string | null;
  defaultEmailAddress: {
    emailAddress: string | null;
  } | null;
};

type CreditTransactionNode = {
  __typename: "StoreCreditAccountCreditTransaction";
  id: string;
  amount: Money;
  balanceAfterTransaction: Money;
  createdAt: string;
  expiresAt: string | null;
  remainingAmount: Money | null;
};

type DebitTransactionNode = {
  __typename: "StoreCreditAccountDebitTransaction";
  id: string;
  amount: Money;
  balanceAfterTransaction: Money;
  createdAt: string;
};

type DebitRevertTransactionNode = {
  __typename: "StoreCreditAccountDebitRevertTransaction";
  id: string;
  amount: Money;
  balanceAfterTransaction: Money;
  createdAt: string;
  debitTransaction: {
    id: string;
  } | null;
};

type ExpirationTransactionNode = {
  __typename: "StoreCreditAccountExpirationTransaction";
  amount: Money;
  balanceAfterTransaction: Money;
  createdAt: string;
  creditTransaction: {
    id: string;
  } | null;
};

type SummaryTransactionNode =
  | CreditTransactionNode
  | DebitTransactionNode
  | DebitRevertTransactionNode
  | ExpirationTransactionNode;

type StoreCreditAccountSummary = {
  id: string;
  balance: Money;
  recentTransactions: {
    edges: Array<{
      node: SummaryTransactionNode;
    }>;
  };
  expiringTransactions: {
    edges: Array<{
      node: CreditTransactionNode;
    }>;
  };
};

type CustomerSummaryRecord = CustomerMatch & {
  storeCreditAccounts: {
    edges: Array<{
      node: StoreCreditAccountSummary;
    }>;
  };
};

type ManualGrantRequest = {
  admin: AdminGraphqlClient;
  shop: string;
  customerEmail: string;
  amount: string;
  currencyCode: string;
  expiresInDays: number;
  notifyCustomer: boolean;
  reason: string;
};

type ManualGrantByCustomerIdRequest = Omit<ManualGrantRequest, "customerEmail"> & {
  customerId: string;
};

function buildExpiryAt(expiresInDays: number) {
  const expiresAt = new Date();
  expiresAt.setHours(23, 59, 59, 999);
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);
  return expiresAt.toISOString();
}

function parseMoneyAmount(value: string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function serializeManualGrantLog(log: {
  id: string;
  amount: string;
  currencyCode: string;
  createdAt: Date;
  expiresAt: Date | null;
  reason: string | null;
  notifyCustomer: boolean;
  balanceAfterAmount: string | null;
}) {
  return {
    id: log.id,
    amount: log.amount,
    currencyCode: log.currencyCode,
    createdAt: log.createdAt.toISOString(),
    expiresAt: log.expiresAt?.toISOString() ?? null,
    reason: log.reason,
    notifyCustomer: log.notifyCustomer,
    balanceAfterAmount: log.balanceAfterAmount,
  };
}

function mapTransactionType(typeName: SummaryTransactionNode["__typename"]) {
  switch (typeName) {
    case "StoreCreditAccountCreditTransaction":
      return "credit";
    case "StoreCreditAccountDebitTransaction":
      return "debit";
    case "StoreCreditAccountDebitRevertTransaction":
      return "debit_revert";
    case "StoreCreditAccountExpirationTransaction":
      return "expiration";
    default:
      return "unknown";
  }
}

async function findCustomerById(
  admin: AdminGraphqlClient,
  customerId: string,
): Promise<CustomerMatch | null> {
  const response = await admin.graphql(
    `#graphql
      query BridgePointsCustomerById($id: ID!) {
        customer(id: $id) {
          id
          displayName
          defaultEmailAddress {
            emailAddress
          }
        }
      }
    `,
    {
      variables: {
        id: customerId,
      },
    },
  );

  const json = await response.json();
  return (json.data?.customer as CustomerMatch | null) ?? null;
}

async function findCustomerByEmail(
  admin: AdminGraphqlClient,
  email: string,
): Promise<CustomerMatch | null> {
  const response = await admin.graphql(
    `#graphql
      query BridgePointsCustomerByEmail($query: String!) {
        customers(first: 5, query: $query) {
          nodes {
            id
            displayName
            defaultEmailAddress {
              emailAddress
            }
          }
        }
      }
    `,
    {
      variables: {
        query: `email:${JSON.stringify(email)}`,
      },
    },
  );

  const json = await response.json();
  const nodes = (json.data?.customers?.nodes ?? []) as CustomerMatch[];
  return (
    nodes.find(
      (customer) =>
        customer.defaultEmailAddress?.emailAddress?.toLowerCase() === email.toLowerCase(),
    ) ?? null
  );
}

async function createManualGrantLog({
  shop,
  customer,
  transaction,
  customerEmailFallback,
  notifyCustomer,
  reason,
}: {
  shop: string;
  customer: CustomerMatch;
  transaction: {
    id: string;
    amount: Money;
    expiresAt: string | null;
    account: {
      id: string;
      balance: Money;
    };
  };
  customerEmailFallback?: string;
  notifyCustomer: boolean;
  reason: string;
}) {
  await prisma.manualGrantLog.create({
    data: {
      shop,
      customerId: customer.id,
      customerEmail:
        customer.defaultEmailAddress?.emailAddress ?? customerEmailFallback ?? "unknown",
      customerDisplayName: customer.displayName,
      amount: transaction.amount.amount,
      currencyCode: transaction.amount.currencyCode,
      expiresAt: transaction.expiresAt ? new Date(transaction.expiresAt) : null,
      notifyCustomer,
      reason: reason || null,
      storeCreditAccountId: transaction.account.id,
      storeCreditTxnId: transaction.id,
      balanceAfterAmount: transaction.account.balance.amount,
    },
  });
}

async function creditStoreCreditAccount({
  admin,
  customerId,
  amount,
  currencyCode,
  expiresInDays,
  notifyCustomer,
}: {
  admin: AdminGraphqlClient;
  customerId: string;
  amount: string;
  currencyCode: string;
  expiresInDays: number;
  notifyCustomer: boolean;
}) {
  const expiresAt = buildExpiryAt(expiresInDays);
  const response = await admin.graphql(
    `#graphql
      mutation BridgePointsManualCredit(
        $id: ID!
        $creditInput: StoreCreditAccountCreditInput!
      ) {
        storeCreditAccountCredit(id: $id, creditInput: $creditInput) {
          storeCreditAccountTransaction {
            id
            amount {
              amount
              currencyCode
            }
            createdAt
            expiresAt
            account {
              id
              balance {
                amount
                currencyCode
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      variables: {
        id: customerId,
        creditInput: {
          creditAmount: {
            amount,
            currencyCode,
          },
          expiresAt,
          notify: notifyCustomer,
        },
      },
    },
  );

  const json = await response.json();
  const payload = json.data?.storeCreditAccountCredit;
  const userErrors = payload?.userErrors ?? [];

  if (userErrors.length > 0) {
    throw new Error(userErrors[0]?.message ?? "Store Credit の付与に失敗しました。");
  }

  const transaction = payload?.storeCreditAccountTransaction;
  if (!transaction) {
    throw new Error("Store Credit transaction の作成結果を取得できませんでした。");
  }

  return transaction as {
    id: string;
    amount: Money;
    createdAt: string;
    expiresAt: string | null;
    account: {
      id: string;
      balance: Money;
    };
  };
}

export async function getShopCurrency(admin: AdminGraphqlClient) {
  const response = await admin.graphql(
    `#graphql
      query BridgePointsShopCurrency {
        shop {
          currencyCode
        }
      }
    `,
  );
  const json = await response.json();
  return json.data?.shop?.currencyCode ?? "JPY";
}

export async function getCustomerStoreCreditSummary({
  admin,
  shop,
  customerId,
}: {
  admin: AdminGraphqlClient;
  shop: string;
  customerId: string;
}) {
  const [response, shopCurrency, recentManualGrants] = await Promise.all([
    admin.graphql(
      `#graphql
        query BridgePointsCustomerStoreCreditSummary($id: ID!) {
          customer(id: $id) {
            id
            displayName
            defaultEmailAddress {
              emailAddress
            }
            storeCreditAccounts(first: 1) {
              edges {
                node {
                  id
                  balance {
                    amount
                    currencyCode
                  }
                  recentTransactions: transactions(first: 10, sortKey: CREATED_AT, reverse: true) {
                    edges {
                      node {
                        __typename
                        amount {
                          amount
                          currencyCode
                        }
                        balanceAfterTransaction {
                          amount
                          currencyCode
                        }
                        createdAt
                        ... on StoreCreditAccountCreditTransaction {
                          id
                          expiresAt
                          remainingAmount {
                            amount
                            currencyCode
                          }
                        }
                        ... on StoreCreditAccountDebitTransaction {
                          id
                        }
                        ... on StoreCreditAccountDebitRevertTransaction {
                          id
                          debitTransaction {
                            id
                          }
                        }
                        ... on StoreCreditAccountExpirationTransaction {
                          creditTransaction {
                            id
                          }
                        }
                      }
                    }
                  }
                  expiringTransactions: transactions(first: 20, query: "type:credit AND expires_at:*") {
                    edges {
                      node {
                        __typename
                        ... on StoreCreditAccountCreditTransaction {
                          id
                          expiresAt
                          remainingAmount {
                            amount
                            currencyCode
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `,
      {
        variables: {
          id: customerId,
        },
      },
    ),
    getShopCurrency(admin),
    prisma.manualGrantLog.findMany({
      where: {
        shop,
        customerId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 5,
    }),
  ]);

  const json = await response.json();
  const customer = (json.data?.customer as CustomerSummaryRecord | null) ?? null;

  if (!customer) {
    throw new Error("顧客情報を取得できませんでした。");
  }

  const account = customer.storeCreditAccounts.edges[0]?.node ?? null;
  const expiringCredits = (account?.expiringTransactions.edges ?? [])
    .map((edge) => edge.node)
    .filter((node): node is CreditTransactionNode => Boolean(node?.id));

  const nextExpiration =
    expiringCredits
      .filter(
        (transaction) =>
          Boolean(transaction.expiresAt) &&
          parseMoneyAmount(transaction.remainingAmount?.amount) > 0,
      )
      .sort((left, right) => {
        return (
          new Date(left.expiresAt ?? "").getTime() -
          new Date(right.expiresAt ?? "").getTime()
        );
      })[0] ?? null;

  const expiringBalance = expiringCredits.reduce((total, transaction) => {
    return total + parseMoneyAmount(transaction.remainingAmount?.amount);
  }, 0);

  return {
    shopCurrency,
    customer: {
      id: customer.id,
      displayName: customer.displayName,
      email: customer.defaultEmailAddress?.emailAddress ?? null,
    },
    account: account
      ? {
          id: account.id,
          balance: account.balance,
          expiringBalance: {
            amount: expiringBalance.toFixed(2),
            currencyCode: account.balance.currencyCode,
          },
        }
      : null,
    nextExpiration: nextExpiration
      ? {
          expiresAt: nextExpiration.expiresAt,
          remainingAmount: nextExpiration.remainingAmount,
        }
      : null,
    recentTransactions: (account?.recentTransactions.edges ?? []).map(({ node }) => ({
      id:
        "id" in node && node.id
          ? node.id
          : `${node.__typename}-${node.createdAt}`,
      type: mapTransactionType(node.__typename),
      createdAt: node.createdAt,
      amount: node.amount,
      balanceAfterTransaction: node.balanceAfterTransaction,
      expiresAt:
        node.__typename === "StoreCreditAccountCreditTransaction" ? node.expiresAt : null,
      remainingAmount:
        node.__typename === "StoreCreditAccountCreditTransaction"
          ? node.remainingAmount
          : null,
    })),
    recentManualGrants: recentManualGrants.map(serializeManualGrantLog),
  };
}

export async function issueManualStoreCredit({
  admin,
  shop,
  customerEmail,
  amount,
  currencyCode,
  expiresInDays,
  notifyCustomer,
  reason,
}: ManualGrantRequest) {
  const customer = await findCustomerByEmail(admin, customerEmail);

  if (!customer) {
    throw new Error("該当する顧客が見つかりません。メールアドレスを確認してください。");
  }

  const transaction = await creditStoreCreditAccount({
    admin,
    customerId: customer.id,
    amount,
    currencyCode,
    expiresInDays,
    notifyCustomer,
  });

  await createManualGrantLog({
    shop,
    customer,
    transaction,
    customerEmailFallback: customerEmail,
    notifyCustomer,
    reason,
  });

  return {
    customer,
    transaction,
  };
}

export async function issueManualStoreCreditByCustomerId({
  admin,
  shop,
  customerId,
  amount,
  currencyCode,
  expiresInDays,
  notifyCustomer,
  reason,
}: ManualGrantByCustomerIdRequest) {
  const customer = await findCustomerById(admin, customerId);

  if (!customer) {
    throw new Error("顧客情報を解決できませんでした。");
  }

  const transaction = await creditStoreCreditAccount({
    admin,
    customerId,
    amount,
    currencyCode,
    expiresInDays,
    notifyCustomer,
  });

  await createManualGrantLog({
    shop,
    customer,
    transaction,
    notifyCustomer,
    reason,
  });

  return {
    customer,
    transaction,
  };
}
