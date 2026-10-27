FROM golang:1.24-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /app/server ./cmd/server

FROM alpine:3.20
WORKDIR /app
RUN apk --no-cache add ca-certificates tzdata
COPY --from=builder /app/server /app/server
COPY factory_layout.json /app/factory_layout.json
EXPOSE 8080
ENV PORT=8080
ENV MQTT_BROKER=tcp://mosquitto:1883
ENV AGV_ID=AGV-001
ENV LAYOUT_FILE=/app/factory_layout.json
CMD ["/app/server"]
