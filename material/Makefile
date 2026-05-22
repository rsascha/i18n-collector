.PHONY: build-pngs clean update-readme

# Rendert alle PlantUML-Quellen in diesem Ordner zu PNG und stempelt den
# Content-Hash als ?v=<hash>-Query-String an die Image-Referenzen im
# Root-README. GitHub's Camo-Proxy cached Images mit fester URL — die
# Hash-Query bricht den Cache, sobald sich das PNG ändert.
#
# Aufruf vom Repo-Root: `make -C material build-pngs`.

PLANTUMLS := $(wildcard *.plantuml)
PNGS      := $(PLANTUMLS:.plantuml=.png)
# Weitere Bild-Assets, die NICHT aus PlantUML generiert werden (handgemachte
# Screenshots, Demo-GIFs, …) — bekommen denselben ?v=<hash>-Stempel.
EXTRA_MEDIA := $(wildcard *.gif) $(wildcard *.jpg) $(wildcard *.jpeg)
MEDIA       := $(PNGS) $(EXTRA_MEDIA)

build-pngs: $(PNGS) update-readme

%.png: %.plantuml
	plantuml -tpng $<

update-readme:
	@for media in $(MEDIA); do \
	  [ -f $$media ] || continue; \
	  hash=$$(shasum -a 256 $$media | cut -c1-8); \
	  sed -i.bak -E "s|(material/$$media)(\?v=[a-f0-9]+)?|\1?v=$$hash|g" ../README.md; \
	done
	@rm -f ../README.md.bak

clean:
	rm -f $(PNGS)
