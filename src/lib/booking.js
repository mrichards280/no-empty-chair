// Build a prefilled booking email (mailto) for a given service or session.
export function bookingHref(email, service) {
  const subject = `Booking inquiry: ${service}`;
  const body =
    `Hi Makayla,\n\nI'd like to book ${service} for my salon.\n\n` +
    `Name:\nSalon / Instagram:\nBest way to reach me:\n\nThanks!`;
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
