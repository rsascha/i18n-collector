# syntax=docker/dockerfile:1.7

# ---------- Stage 1: Build ----------
FROM eclipse-temurin:25-jdk AS builder
WORKDIR /build

# mvnw + Maven-Konfiguration zuerst kopieren, damit Layer-Caching greift,
# solange sich pom.xml nicht ändert.
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN chmod +x mvnw && ./mvnw -B -q dependency:go-offline

COPY src/ src/
RUN ./mvnw -B -DskipTests package \
    && cp target/api-*.jar target/app.jar

# ---------- Stage 2: Runtime ----------
FROM eclipse-temurin:25-jre
WORKDIR /app

COPY --from=builder /build/target/app.jar app.jar

EXPOSE 8080
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75.0"
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar"]
