@id("leads-cancel-orders")
permit (
  principal is Eve::User,
  action == Eve::Action::"cancel_order",
  resource == Eve::Agent::"orderdesk"
)
when {
  principal.hasTag("role") &&
  ["support-lead", "admin"].contains(principal.getTag("role"))
};
