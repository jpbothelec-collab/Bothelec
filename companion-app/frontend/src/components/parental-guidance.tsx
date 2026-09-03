// Shared parental-controls guidance, used by both the age gate and the
// standalone /parental-controls page so the content lives in one place.

export const GUIDELINES = [
  {
    title: "Built-in device controls",
    body: "Apple Screen Time (Content & Privacy Restrictions), Google Family Link, and Microsoft Family Safety can block adult and unrated websites on phones, tablets and computers.",
  },
  {
    title: "Content-filtering apps",
    body: "Dedicated tools such as Net Nanny, Qustodio, Bark or Canopy filter adult content across devices and let you set per-child rules.",
  },
  {
    title: "Home network & router",
    body: "Many routers include family/parental filters; DNS services like Cloudflare for Families (1.1.1.3), OpenDNS FamilyShield or CleanBrowsing block adult sites for every device on your Wi-Fi.",
  },
  {
    title: "Browser & search settings",
    body: "Turn on SafeSearch (Google, Bing) and your browser's built-in content restrictions, and keep devices in shared family spaces.",
  },
];

export function ParentalGuidance() {
  return (
    <div className="flex flex-col gap-3 text-muted">
      <p>
        This website is labelled{" "}
        <abbr title="Restricted to Adults" className="font-medium text-ink no-underline">
          RTA (&ldquo;Restricted to Adults&rdquo;)
        </abbr>
        , a standard label that parental-control and content-filtering software recognises
        automatically. You can also restrict access yourself:
      </p>
      <ul className="flex flex-col gap-2">
        {GUIDELINES.map((g) => (
          <li key={g.title} className="flex gap-2.5">
            <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-accent" />
            <span>
              <span className="font-medium text-ink">{g.title}.</span> {g.body}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-faint">
        No filter is perfect — combining device, network and account controls with an open
        conversation about online safety works best.
      </p>
    </div>
  );
}
