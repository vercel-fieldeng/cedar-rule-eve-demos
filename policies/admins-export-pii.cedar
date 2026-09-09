@id("admins-export-pii")
permit (
  principal is Eve::User,
  action == Eve::Action::"export_customer_data",
  resource == Eve::Agent::"orderdesk"
)
when { principal.hasTag("role") && principal.getTag("role") == "admin" };
