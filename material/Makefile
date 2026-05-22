.PHONY: build-pngs clean

# Rendert alle PlantUML-Quellen in diesem Ordner zu PNG.
# Pattern-Rule: nur Dateien, deren .plantuml neuer ist als das PNG, werden
# neu gerendert. Aufruf vom Repo-Root: `make -C material build-pngs`.

PLANTUMLS := $(wildcard *.plantuml)
PNGS      := $(PLANTUMLS:.plantuml=.png)

build-pngs: $(PNGS)

%.png: %.plantuml
	plantuml -tpng $<

clean:
	rm -f $(PNGS)
