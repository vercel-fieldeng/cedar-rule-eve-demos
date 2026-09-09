@id("finance-approves-refunds")
permit (
  principal is Eve::User,
  action == Eve::Action::"approve_refund",
  resource == Eve::Agent::"orderdesk"
)
when {
  principal.hasTag("role") &&
  ["finance", "admin"].contains(principal.getTag("role")) &&
  context.input.amount <= 5000
};
