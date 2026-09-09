@id("forbid-refund-budget-over-2000")
forbid (
  principal,
  action == Eve::Action::"process_refund",
  resource
)
when {
  context.session.prior has process_refund &&
  context.session.prior.process_refund.amountTotal + context.input.amount > 2000
};
