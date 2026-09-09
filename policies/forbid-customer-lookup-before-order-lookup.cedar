@id("forbid-customer-lookup-before-order-lookup")
forbid (
  principal is Eve::User,
  action == Eve::Action::"lookup_customer",
  resource
)
when { !(context.session.prior has lookup_order) };
