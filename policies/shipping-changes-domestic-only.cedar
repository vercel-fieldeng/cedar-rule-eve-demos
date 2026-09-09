@id("shipping-changes-domestic-only")
permit (
  principal is Eve::User,
  action == Eve::Action::"update_shipping_address",
  resource == Eve::Agent::"orderdesk"
)
when {
  principal.hasTag("role") &&
  (
    principal.getTag("role") == "admin" ||
    (principal.getTag("role") == "support-lead" && ["US", "CA"].contains(context.input.country))
  )
};
