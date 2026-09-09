@id("forbid-contractor-pii")
forbid (
  principal is Eve::User,
  action == Eve::Action::"export_customer_data",
  resource
)
when {
  principal.hasTag("employment") &&
  principal.getTag("employment") == "contractor"
};
