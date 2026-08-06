# tunnel.sh
#!/bin/bash
echo "Starting the stack..."
docker compose up -d

echo "Waiting for Next.js to be ready..."
until curl -s http://localhost:3002 > /dev/null; do
  sleep 2
  echo "  ... Waiting for Next.js"
done

echo "Next.js Ready ! Starting tunnel..."
cloudflared tunnel --url http://localhost:3002