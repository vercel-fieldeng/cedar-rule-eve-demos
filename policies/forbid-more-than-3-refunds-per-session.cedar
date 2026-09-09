@id("forbid-more-than-3-refunds-per-session")
forbid (
  principal,
  action == Eve::Action::"process_refund",
  resource
)
when { context.session.counts.process_refund >= 3 };
