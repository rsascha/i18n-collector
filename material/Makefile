.PHONY: build-pngs clean update-readme

# Rendert alle PlantUML-Quellen in diesem Ordner zu PNG und stempelt den
# Content-Hash als ?v=<hash>-Query-String an die Image-Referenzen im
# Root-README. GitHub's Camo-Proxy cached Images mit fester URL — die
# Hash-Query bricht den Cache, sobald sich das PNG ändert.
#
# Aufruf vom Repo-Root: `make -C material build-pngs`.

PLANTUMLS := $(wildcard *.plantuml)
PNGS      := $(PLANTUMLS:.plantuml=.png)

build-pngs: $(PNGS) update-readme

%.png: %.plantuml
	plantuml -tpng $<

update-readme:
	@for png in $(PNGS); do \
	  hash=$$(shasum -a 256 $$png | cut -c1-8); \
	  sed -i.bak -E "s|(material/$$png)(\?v=[a-f0-9]+)?|\1?v=$$hash|g" ../README.md; \
	done
	@rm -f ../README.md.bak

clean:
	rm -f $(PNGS)
