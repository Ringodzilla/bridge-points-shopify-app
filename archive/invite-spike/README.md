# Invite Spike Archive

このディレクトリには、`customerSendAccountInviteEmail` を前提にしていた旧 spike を退避しています。

退避理由:

- `legacy customer accounts` 依存で、新規ストアでは成立しない
- Bridge Points の実装と同居させると route / billing / DB の責務が混線しやすい
- ただし、顧客抽出や順次ジョブ設計の参考としては再利用価値がある

現行の正本仕様は以下です。

- `docs/mvp-spec.md`
- `docs/technical-design.md`
