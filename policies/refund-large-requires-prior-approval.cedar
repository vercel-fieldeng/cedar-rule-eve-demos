@id("refund-large-requires-prior-approval")
permit (
  principal is Eve::User,
  action == Eve::Action::"process_refund",
  resource == Eve::Agent::"orderdesk"
)
when {
  principal.hasTag("role") &&
  ["support-lead", "admin"].contains(principal.getTag("role")) &&
  context.input.amount >= 500 &&
  context.session has refundApproval &&
  context.session.refundApproval.orderId == context.input.orderId &&
  context.session.refundApproval.availableAmount >= context.input.amount &&
  context.system.now.durationSince(context.session.refundApproval.latest) <= duration("1h")
};
