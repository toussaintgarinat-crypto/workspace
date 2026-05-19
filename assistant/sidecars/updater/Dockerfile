FROM alpine:3.19
RUN apk add --no-cache docker-cli docker-compose jq
COPY update-watcher.sh /usr/local/bin/update-watcher.sh
RUN chmod +x /usr/local/bin/update-watcher.sh
CMD ["/usr/local/bin/update-watcher.sh"]
