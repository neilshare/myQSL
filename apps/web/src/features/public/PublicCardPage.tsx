type PublicCard = { qso: { call: string; qso_date: string; time_on: string }; image_url: string | null };
export function PublicCardPage({ card }: { card: PublicCard }) { return <main><h1>电子 QSL</h1><img src={card.image_url ?? ""} alt={`${card.qso.call} QSL`} /><p>{card.qso.call}</p><p>{card.qso.qso_date} {card.qso.time_on} UTC</p></main>; }
