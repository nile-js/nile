import { HomeLayout } from "fumadocs-ui/layouts/home";
import { Credits } from "../../components/home/credits";
import { Ecosystem } from "../../components/home/ecosystem";
import { Features } from "../../components/home/features";
import { Footer } from "../../components/home/footer";
import { Hero } from "../../components/home/hero";
import { HowItWorks } from "../../components/home/how-it-works";
import { HomeMotion } from "../../components/home/motion";
import { Performance } from "../../components/home/performance";
import { ProductionStory } from "../../components/home/production-story";
import { Structure } from "../../components/home/structure";
import { Video } from "../../components/home/video";
import { layoutOptions } from "../lib/layout";
import {
	absoluteUrl,
	OG_IMAGE_ALT,
	OG_IMAGE_HEIGHT,
	OG_IMAGE_URL,
	OG_IMAGE_WIDTH,
	SITE_DESCRIPTION,
	withBase,
} from "../lib/site";
import "../../docs/home.css";

const HOME_TITLE = "Nile Js | Keep shipping as your backend grows";
const HOME_URL = absoluteUrl("/");
const REPOSITORY_URL = "https://github.com/nile-js/nile";
const LICENSE_URL = `${REPOSITORY_URL}/blob/main/LICENSE`;
const ORGANIZATION_NAME = "Nile Squad Labz";
const AUTHOR_NAME = "Hussein Kizza";

/** Factual structured data only: no ratings, prices, download counts or other invented values. */
const HOME_JSON_LD = {
	"@context": "https://schema.org",
	"@graph": [
		{
			"@type": "WebSite",
			name: "Nile Js",
			url: HOME_URL,
			description: SITE_DESCRIPTION,
			publisher: { "@type": "Organization", name: ORGANIZATION_NAME },
		},
		{
			"@type": "SoftwareSourceCode",
			name: "Nile Js",
			description: SITE_DESCRIPTION,
			url: HOME_URL,
			codeRepository: REPOSITORY_URL,
			programmingLanguage: "TypeScript",
			license: LICENSE_URL,
			author: {
				"@type": "Person",
				name: AUTHOR_NAME,
				jobTitle: "Creator of Nile Js",
			},
			publisher: { "@type": "Organization", name: ORGANIZATION_NAME },
		},
	],
};

export const meta = () => [
	{ title: HOME_TITLE },
	{ name: "description", content: SITE_DESCRIPTION },
	{ tagName: "link", rel: "canonical", href: HOME_URL },
	{ property: "og:type", content: "website" },
	{ property: "og:url", content: HOME_URL },
	{ property: "og:title", content: HOME_TITLE },
	{ property: "og:description", content: SITE_DESCRIPTION },
	{ property: "og:image", content: OG_IMAGE_URL },
	{ property: "og:image:width", content: OG_IMAGE_WIDTH },
	{ property: "og:image:height", content: OG_IMAGE_HEIGHT },
	{ property: "og:image:alt", content: OG_IMAGE_ALT },
	{ name: "twitter:title", content: HOME_TITLE },
	{ name: "twitter:description", content: SITE_DESCRIPTION },
	{ name: "twitter:image", content: OG_IMAGE_URL },
	{ "script:ld+json": HOME_JSON_LD },
];

/** Show the programming model first, then measured performance and the people behind Nile. */
export default function Home() {
	return (
		<HomeLayout {...layoutOptions()}>
			<div className="nile-home" id="main-content">
				<img
					className="nile-ambient"
					src={withBase("/images/nile-atmosphere.svg")}
					alt=""
					aria-hidden="true"
					width={1600}
					height={9000}
				/>
				<Hero />
				<HowItWorks />
				<Performance />
				<ProductionStory />
				<Video />
				<Features />
				<Structure />
				<Credits />
				<Ecosystem />
				<Footer />
				<HomeMotion />
			</div>
		</HomeLayout>
	);
}
