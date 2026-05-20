import logging

import httpx
from lxml import etree

logger = logging.getLogger(__name__)

ATOM_NS = "http://www.w3.org/2005/Atom"

OPENAI_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_kiwix",
            "description": (
                "Recherche dans Wikipedia offline via Kiwix. "
                "Utilise cet outil pour des questions encyclopédiques ou quand internet est indisponible."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Terme à rechercher"},
                    "lang": {
                        "type": "string",
                        "description": "Langue de recherche (défaut : fr)",
                        "default": "fr",
                    },
                },
                "required": ["query"],
            },
        },
    }
]


class KiwixTools:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")

    def get_tools(self) -> list[dict]:
        return OPENAI_TOOLS

    async def search(self, query: str, lang: str = "fr") -> list[dict]:
        url = f"{self.base_url}/search"
        params = {"pattern": query, "books.filter.lang": lang}
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()

        try:
            root = etree.fromstring(resp.content)
        except etree.XMLSyntaxError:
            return []

        ns = {"atom": ATOM_NS}
        entries = root.findall("atom:entry", ns)
        results = []
        for entry in entries[:5]:
            title_el = entry.find("atom:title", ns)
            link_el = entry.find("atom:link", ns)
            summary_el = entry.find("atom:content", ns) or entry.find("atom:summary", ns)
            results.append(
                {
                    "title": title_el.text if title_el is not None else "",
                    "url": (
                        f"{self.base_url}{link_el.get('href', '')}"
                        if link_el is not None
                        else ""
                    ),
                    "snippet": (summary_el.text or "")[:200] if summary_el is not None else "",
                }
            )
        return results

    async def execute_tool(self, name: str, args: dict) -> str:
        if name == "search_kiwix":
            try:
                results = await self.search(args["query"], args.get("lang", "fr"))
            except Exception as e:
                logger.warning("Kiwix search failed: %s", e)
                return "Kiwix indisponible pour cette recherche."
            if not results:
                return "Aucun résultat trouvé dans la base Kiwix."
            return "\n".join(
                f"- **{r['title']}**{': ' + r['snippet'] if r['snippet'] else ''} ({r['url']})"
                for r in results
            )
        raise ValueError(f"Unknown tool: {name}")
