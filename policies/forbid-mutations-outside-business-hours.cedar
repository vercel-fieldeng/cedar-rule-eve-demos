@id("forbid-mutations-outside-business-hours")
forbid (
  principal,
  action in [Eve::Action::"process_refund", Eve::Action::"cancel_order"],
  resource
)
when {
  context.system.now.toTime() < duration("8h") ||
  context.system.now.toTime() > duration("20h")
};
