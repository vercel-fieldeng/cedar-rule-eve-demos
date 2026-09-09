@id("finance-discounts-up-to-30")
permit (
  principal is Eve::User,
  action == Eve::Action::"apply_discount",
  resource == Eve::Agent::"orderdesk"
)
when {
  principal.hasTag("role") &&
  (
    principal.getTag("role") == "admin" ||
    (principal.getTag("role") == "finance" && context.input.percent <= 30)
  )
};
