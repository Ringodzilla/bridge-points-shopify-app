import type { InviteJob } from "@prisma/client";
import prisma from "../db.server";
import { SEND_UNIT_PRICE_JPY, SEND_USAGE_PLAN } from "./billing";
import {
  buildCustomerSearchQuery,
  INVITE_BATCH_SIZE,
  INVITE_PREVIEW_LIMIT,
  type PreviewCustomer,
  type SegmentFilters,
} from "./invite-jobs";

type GraphqlAdminClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type BillingContext = {
  require: (options: {
    plans: typeof SEND_USAGE_PLAN[];
    isTest: boolean;
    onFailure: (error: Error) => Promise<Response>;
  }) => Promise<unknown>;
  request: (options: {
    plan: typeof SEND_USAGE_PLAN;
    isTest?: boolean;
    returnUrl?: string;
  }) => Promise<Response>;
  createUsageRecord: (options: {
    description: string;
    price: {
      amount: number;
      currencyCode: string;
    };
    isTest: boolean;
    subscriptionLineItemId?: string;
    idempotencyKey?: string;
  }) => Promise<unknown>;
};

type CountResult = {
  count: number;
  precision: string;
};

type CustomersResponse = {
  customersCount: CountResult;
  customers: {
    edges: Array<{
      cursor: string;
      node: {
        id: string;
        displayName: string | null;
        firstName: string | null;
        lastName: string | null;
        state: string;
        tags: string[];
        numberOfOrders: number | string;
        defaultEmailAddress: { emailAddress: string } | null;
      };
    }>;
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
  };
};

type InviteMutationResponse = {
  customerSendAccountInviteEmail: {
    customer: { id: string } | null;
    userErrors: Array<{
      field: string[] | null;
      message: string;
    }>;
  };
};

type CustomerAccountsStatusResponse = {
  shop: {
    customerAccounts: string;
    customerAccountsV2: {
      customerAccountsVersion: "CLASSIC" | "NEW_CUSTOMER_ACCOUNTS";
      loginLinksVisibleOnStorefrontAndCheckout: boolean;
      loginRequiredAtCheckout: boolean;
      url: string | null;
    } | null;
  };
};

const CUSTOMER_PREVIEW_QUERY = `#graphql
  query InviteAudiencePreview($query: String!, $first: Int!, $after: String) {
    customersCount(query: $query) {
      count
      precision
    }
    customers(first: $first, after: $after, query: $query, sortKey: CREATED_AT) {
      edges {
        cursor
        node {
          id
          displayName
          firstName
          lastName
          state
          tags
          numberOfOrders
          defaultEmailAddress {
            emailAddress
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const CUSTOMER_ACCOUNTS_STATUS_QUERY = `#graphql
  query InviteCustomerAccountsStatus {
    shop {
      customerAccounts
      customerAccountsV2 {
        customerAccountsVersion
        loginLinksVisibleOnStorefrontAndCheckout
        loginRequiredAtCheckout
        url
      }
    }
  }
`;

const SEND_ACCOUNT_INVITE_MUTATION = `#graphql
  mutation SendBulkAccountInvite($customerId: ID!, $email: EmailInput) {
    customerSendAccountInviteEmail(customerId: $customerId, email: $email) {
      customer {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

function compactObject<T extends Record<string, string | undefined | null>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => Boolean(item?.trim())),
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "不明なエラーが発生しました。";
}

async function adminGraphql<TData>(
  admin: GraphqlAdminClient,
  query: string,
  variables?: Record<string, unknown>,
) {
  const response = await admin.graphql(query, variables ? { variables } : undefined);
  const payload = (await response.json()) as {
    data?: TData;
    errors?: Array<{ message?: string }>;
  };

  if (payload.errors?.length) {
    throw new Error(
      payload.errors.map((item) => item.message || "GraphQL error").join(" / "),
    );
  }

  if (!payload.data) {
    throw new Error("Shopify API からデータを取得できませんでした。");
  }

  return payload.data;
}

function toPreviewCustomer(node: CustomersResponse["customers"]["edges"][number]["node"]): PreviewCustomer {
  const displayName =
    node.displayName ||
    [node.lastName, node.firstName].filter(Boolean).join(" ") ||
    node.defaultEmailAddress?.emailAddress ||
    "名称未設定";

  return {
    id: node.id,
    displayName,
    email: node.defaultEmailAddress?.emailAddress ?? null,
    tags: node.tags,
    numberOfOrders: Number(node.numberOfOrders ?? 0),
    state: node.state,
  };
}

export async function createInviteDraft(input: {
  shop: string;
  name: string;
  subject: string;
  body: string;
  customMessage: string;
  from: string;
}) {
  return prisma.inviteJob.create({
    data: {
      shop: input.shop,
      name: input.name.trim(),
      subject: input.subject.trim(),
      body: input.body.trim(),
      customMessage: input.customMessage.trim() || null,
      from: input.from.trim() || null,
    },
  });
}

export async function getInviteJobById(shop: string, jobId: string) {
  return prisma.inviteJob.findFirst({
    where: { id: jobId, shop },
    include: {
      deliveries: {
        orderBy: { processedAt: "desc" },
        take: 10,
      },
    },
  });
}

export async function requireInviteJob(shop: string, jobId: string) {
  const job = await getInviteJobById(shop, jobId);

  if (!job) {
    throw new Error("対象の招待ジョブが見つかりません。");
  }

  return job;
}

export async function fetchInviteAudiencePreview(
  admin: GraphqlAdminClient,
  filters: SegmentFilters,
  after?: string | null,
) {
  const segmentQuery = buildCustomerSearchQuery(filters);

  if (!segmentQuery) {
    throw new Error("少なくとも 1 つは招待条件を指定してください。");
  }

  const data = await adminGraphql<CustomersResponse>(admin, CUSTOMER_PREVIEW_QUERY, {
    query: segmentQuery,
    first: INVITE_PREVIEW_LIMIT,
    after: after ?? null,
  });

  return {
    segmentQuery,
    count: data.customersCount.count,
    precision: data.customersCount.precision,
    customers: data.customers.edges.map(({ node }) => toPreviewCustomer(node)),
    pageInfo: data.customers.pageInfo,
  };
}

export async function saveInvitePreview(input: {
  jobId: string;
  shop: string;
  filters: SegmentFilters;
  preview: Awaited<ReturnType<typeof fetchInviteAudiencePreview>>;
}) {
  return prisma.inviteJob.update({
    where: { id: input.jobId },
    data: {
      shop: input.shop,
      tagInput: input.filters.tagInput.trim() || null,
      emailFilter: input.filters.emailFilter,
      purchaseFilter: input.filters.purchaseFilter,
      purchasedAfter: input.filters.purchasedAfter.trim() || null,
      segmentQuery: input.preview.segmentQuery,
      previewCount: input.preview.count,
      previewPrecision: input.preview.precision,
      previewCustomersJson: JSON.stringify(input.preview.customers),
      nextCursor: null,
      status: input.preview.count > 0 ? "draft" : "empty",
      queuedAt: null,
      startedAt: null,
      completedAt: null,
      lastError: null,
      attemptedCount: 0,
      successCount: 0,
      failureCount: 0,
      billedCount: 0,
      lastBillingError: null,
    },
  });
}

export async function queueInviteJob(shop: string, jobId: string) {
  const job = await requireInviteJob(shop, jobId);

  if (!job.segmentQuery || job.previewCount < 1) {
    throw new Error("対象顧客プレビューが未作成、または対象件数が 0 件です。");
  }

  await prisma.inviteDelivery.deleteMany({
    where: { jobId: job.id },
  });

  return prisma.inviteJob.update({
    where: { id: job.id },
    data: {
      status: "queued",
      queuedAt: new Date(),
      startedAt: null,
      completedAt: null,
      nextCursor: null,
      lastError: null,
      attemptedCount: 0,
      successCount: 0,
      failureCount: 0,
      billedCount: 0,
      lastBillingError: null,
    },
  });
}

async function sendInviteToCustomer(
  admin: GraphqlAdminClient,
  job: InviteJob,
  customerId: string,
) {
  const email = compactObject({
    subject: job.subject,
    body: job.body,
    customMessage: job.customMessage,
    from: job.from,
  });

  const data = await adminGraphql<InviteMutationResponse>(
    admin,
    SEND_ACCOUNT_INVITE_MUTATION,
    {
      customerId,
      email: Object.keys(email).length > 0 ? email : null,
    },
  );

  return data.customerSendAccountInviteEmail.userErrors;
}

export async function runInviteJobBatch(input: {
  admin: GraphqlAdminClient;
  shop: string;
  jobId: string;
  batchSize?: number;
}) {
  const job = await requireInviteJob(input.shop, input.jobId);

  if (!job.segmentQuery) {
    throw new Error("対象顧客クエリが保存されていません。");
  }

  if (job.status !== "queued" && job.status !== "running") {
    throw new Error("queued か running のジョブだけ実行できます。");
  }

  try {
    await prisma.inviteJob.update({
      where: { id: job.id },
      data: {
        status: "running",
        startedAt: job.startedAt ?? new Date(),
        lastError: null,
      },
    });

    const data = await adminGraphql<CustomersResponse>(input.admin, CUSTOMER_PREVIEW_QUERY, {
      query: job.segmentQuery,
      first: input.batchSize ?? INVITE_BATCH_SIZE,
      after: job.nextCursor ?? null,
    });

    const customers = data.customers.edges.map(({ node }) => toPreviewCustomer(node));

    if (customers.length === 0) {
      const completed = await prisma.inviteJob.update({
        where: { id: job.id },
        data: {
          status: "completed",
          completedAt: new Date(),
          nextCursor: null,
          lastError: null,
        },
      });

      return {
        job: completed,
        processedCount: 0,
        successCount: 0,
        failureCount: 0,
        hasNextPage: false,
      };
    }

    let successCount = 0;
    let failureCount = 0;

    for (const customer of customers) {
      let status = "sent";
      let errorMessage: string | null = null;

      try {
        if (!customer.email) {
          throw new Error("メールアドレスが存在しないため招待できません。");
        }

        const userErrors = await sendInviteToCustomer(input.admin, job, customer.id);

        if (userErrors.length > 0) {
          throw new Error(userErrors.map((item) => item.message).join(" / "));
        }

        successCount += 1;
      } catch (error) {
        status = "failed";
        errorMessage = getErrorMessage(error);
        failureCount += 1;
      }

      await prisma.inviteDelivery.upsert({
        where: {
          jobId_customerId: {
            jobId: job.id,
            customerId: customer.id,
          },
        },
        create: {
          jobId: job.id,
          shop: input.shop,
          customerId: customer.id,
          displayName: customer.displayName,
          email: customer.email,
          status,
          errorMessage,
          processedAt: new Date(),
        },
        update: {
          displayName: customer.displayName,
          email: customer.email,
          status,
          errorMessage,
          processedAt: new Date(),
        },
      });
    }

    const hasNextPage = data.customers.pageInfo.hasNextPage;
    const updatedJob = await prisma.inviteJob.update({
      where: { id: job.id },
      data: {
        status: hasNextPage ? "queued" : "completed",
        nextCursor: hasNextPage ? data.customers.pageInfo.endCursor : null,
        completedAt: hasNextPage ? null : new Date(),
        attemptedCount: {
          increment: customers.length,
        },
        successCount: {
          increment: successCount,
        },
        failureCount: {
          increment: failureCount,
        },
        lastError:
          failureCount > 0
            ? `${failureCount} 件で招待送信に失敗しました。`
            : null,
      },
    });

    return {
      job: updatedJob,
      processedCount: customers.length,
      successCount,
      failureCount,
      hasNextPage,
    };
  } catch (error) {
    await prisma.inviteJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        lastError: getErrorMessage(error),
      },
    });

    throw error;
  }
}

export function isBillingTestMode() {
  return process.env.SHOPIFY_BILLING_TEST_MODE !== "false";
}

export async function getCustomerAccountsStatus(admin: GraphqlAdminClient) {
  const data = await adminGraphql<CustomerAccountsStatusResponse>(
    admin,
    CUSTOMER_ACCOUNTS_STATUS_QUERY,
  );
  const version = data.shop.customerAccountsV2?.customerAccountsVersion ?? "NEW_CUSTOMER_ACCOUNTS";

  return {
    requirement: data.shop.customerAccounts,
    version,
    loginLinksVisible:
      data.shop.customerAccountsV2?.loginLinksVisibleOnStorefrontAndCheckout ?? false,
    loginRequiredAtCheckout:
      data.shop.customerAccountsV2?.loginRequiredAtCheckout ?? false,
    accountsUrl: data.shop.customerAccountsV2?.url ?? null,
    legacyCustomerAccountsEnabled: version === "CLASSIC",
  };
}

export async function ensureLegacyCustomerAccounts(admin: GraphqlAdminClient) {
  const status = await getCustomerAccountsStatus(admin);

  if (!status.legacyCustomerAccountsEnabled) {
    throw new Error(
      "このストアは new customer accounts です。customerSendAccountInviteEmail を使うには legacy customer accounts へ切り替えてください。",
    );
  }

  return status;
}

export async function requireInviteBilling(input: {
  billing: BillingContext;
  request: Request;
  returnPath: string;
}) {
  const isTest = isBillingTestMode();

  await input.billing.require({
    plans: [SEND_USAGE_PLAN],
    isTest,
    onFailure: async () =>
      input.billing.request({
        plan: SEND_USAGE_PLAN,
        isTest,
        returnUrl: new URL(input.returnPath, input.request.url).toString(),
      }),
  });
}

export async function syncInviteUsageBilling(input: {
  billing: BillingContext;
  shop: string;
  jobId: string;
}) {
  const job = await requireInviteJob(input.shop, input.jobId);
  const unbilledCount = job.successCount - job.billedCount;

  if (unbilledCount <= 0) {
    return {
      chargedCount: 0,
      warning: null,
    };
  }

  try {
    await input.billing.createUsageRecord({
      description: `${job.name} の招待送信 ${unbilledCount} 件`,
      price: {
        amount: unbilledCount * SEND_UNIT_PRICE_JPY,
        currencyCode: "JPY",
      },
      isTest: isBillingTestMode(),
      idempotencyKey: `invite-job:${job.id}:success:${job.successCount}`,
    });

    await prisma.inviteJob.update({
      where: { id: job.id },
      data: {
        billedCount: job.successCount,
        lastBillingError: null,
      },
    });

    return {
      chargedCount: unbilledCount,
      warning: null,
    };
  } catch (error) {
    const warning =
      error instanceof Error
        ? error.message
        : "usage billing の記録に失敗しました。";

    await prisma.inviteJob.update({
      where: { id: job.id },
      data: {
        lastBillingError: warning,
      },
    });

    return {
      chargedCount: 0,
      warning,
    };
  }
}
