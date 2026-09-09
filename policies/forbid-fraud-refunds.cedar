@id("forbid-fraud-refunds")
forbid (
  principal,
  action == Eve::Action::"process_refund",
  resource
)
when { context.input.reason like "*fraud*" || context.input.reason like "*Fraud*" };
