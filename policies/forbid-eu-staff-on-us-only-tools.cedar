@id("forbid-eu-staff-on-us-only-tools")
forbid (
  principal is Eve::User,
  action == Eve::Action::"cancel_order",
  resource
)
when { principal.hasTag("region") && principal.getTag("region") like "eu-*" };
