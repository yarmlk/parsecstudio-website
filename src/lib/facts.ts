type T = { en: string; uk: string };

/* Facts used on more than one page. Sources: the studio deck and the Vimeo profile (vimeo.com/parsecagency). */

export const CLIENTS = ["Google", "Microsoft", "Coca-Cola", "FIFA", "NASA", "Tefal", "Rowenta", "Kärcher", "Kinder", "Henkel", "Subaru"];

/** The eight service lines, as on the "What we make" page. `line` is the one-line version for decks and the site. */
export const SERVICES: { id: string; name: T; line: T }[] = [
  { id: "cgi", name: { en: "3D animation and CGI", uk: "3D-анімація і CGI" }, line: { en: "Products, worlds and characters in Cinema 4D.", uk: "Продукти, світи й персонажі в Cinema 4D." } },
  { id: "product", name: { en: "Product films", uk: "Продуктові ролики" }, line: { en: "Macro, material and mechanism in one light.", uk: "Макро, матеріал і механіка в одному світлі." } },
  { id: "games", name: { en: "Game trailers", uk: "Ігрові трейлери" }, line: { en: "Trailers and cinematics, from script to final shot.", uk: "Трейлери й синематики, від сценарію до фінального шоту." } },
  { id: "motion", name: { en: "Motion design", uk: "Моушн-дизайн" }, line: { en: "Explainers and interface animation.", uk: "Експлейнери й анімація інтерфейсів." } },
  { id: "brand", name: { en: "Brand and event films", uk: "Бренд- та івент-ролики" }, line: { en: "Launches, openers and presentations.", uk: "Запуски, опенери й презентації." } },
  { id: "ai", name: { en: "AI production", uk: "AI-продакшн" }, line: { en: "Generated footage, directed and finished by hand.", uk: "Згенероване відео, зрежисоване й доведене вручну." } },
  { id: "post", name: { en: "Post-production", uk: "Постпродакшн" }, line: { en: "Editing, colour grading and sound.", uk: "Монтаж, кольорокорекція і звук." } },
  { id: "vertical", name: { en: "Vertical series", uk: "Вертикальні серіали" }, line: { en: "Episodes made for 9:16.", uk: "Епізоди, зняті під 9:16." } },
];

/** Client reviews from parsec.studio, verbatim (English in both languages: they are the client's words). */
export const REVIEWS: { client: string; logo: string; text: string[] }[] = [
  { client: "Google", logo: "img/clients/google.webp", text: [
    "We appreciate the entire Parsec Studio team for delivering a vibrant and stylish animated video, meeting all requirements and deadlines.",
    "They were fully engaged at every stage and aligned with our vision, especially in adhering to Google's visual style.",
    "Looking forward to future collaborations!",
  ] },
  { client: "Tefal", logo: "img/clients/tefal.webp", text: [
    "Parsec Studio effectively translated our brand vision into stunning 3D graphics, giving our product models a modern appearance on screen.",
    "Their high-quality graphics beautifully showcase our premium tableware.",
    "Wishing the team continued success and exciting new projects ahead!",
  ] },
  { client: "Microsoft", logo: "img/clients/microsoft.webp", text: [
    "Parsec Studio stands out as an exceptional editing and production partner among the numerous teams we have collaborated with.",
    "Their dedication to delivering top-tier work, meticulous attention to detail, seamless communication, and strict adherence to deadlines render them invaluable to any fortunate client.",
  ] },
  { client: "Henkel", logo: "img/clients/henkel.webp", text: [
    "Thank you for the fast, high-quality and well-coordinated work!",
    "The video turned out at the highest level. We were pleasantly surprised that the work of the application is shown even better than it actually is.",
    "We were especially impressed by the overall aesthetics of the video, it is immediately noticeable that the team has really good taste.",
  ] },
];

/** The old studio deck, "Over" slide. */
export const OVER: { value: string; suffix?: string; label: T }[] = [
  { value: "10", label: { en: "years of experience", uk: "років досвіду" } },
  { value: "100", suffix: "+", label: { en: "happy customers", uk: "задоволених клієнтів" } },
  { value: "500", suffix: "+", label: { en: "completed projects", uk: "завершених проєктів" } },
  { value: "1000", suffix: "+", label: { en: "logged hours on Upwork", uk: "годин на Upwork" } },
];

/** The old studio deck, "What we admire in good clients". */
export const ADMIRE: T[] = [
  { en: "Collaborative", uk: "Готовність працювати разом" },
  { en: "Decision-making authority", uk: "Право ухвалювати рішення" },
  { en: "Communication clarity", uk: "Ясна комунікація" },
  { en: "An openness to consider change", uk: "Відкритість до змін" },
  { en: "Challenge us and be challenged", uk: "Кидати нам виклик і приймати наш" },
];

export const UPWORK: T = {
  en: "A full-cycle video production company among the top 1% best agencies in the world, pre-selected by Upwork managers and experts.",
  uk: "Компанія повного циклу відеопродакшну серед 1% найкращих агенцій світу, відібрана менеджерами й експертами Upwork.",
};
export const UPWORK_BADGES = ["Expert-Vetted", "Top Rated Plus"];
export const CONTACT = { email: "info@parsec.studio", site: "parsec.studio", vimeo: "vimeo.com/parsecagency" };
