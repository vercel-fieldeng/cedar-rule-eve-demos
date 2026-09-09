@id("refund-under-500-for-leads")
permit (
  principal is Eve::User,
  action == Eve::Action::"process_refund",
  resource == Eve::Agent::"orderdesk"
)
when {
  principal.hasTag("role") &&
  ["support-lead", "admin"].contains(principal.getTag("role")) &&
  context.input.amount < 500
};
