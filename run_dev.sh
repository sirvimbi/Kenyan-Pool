#!/bin/bash
# Script to run both the API server and the Killer Pool frontend

# Function to kill background processes on exit
cleanup() {
  echo "Stopping servers..."
  kill $(jobs -p)
  exit
}

trap cleanup SIGINT SIGTERM

echo "Starting API Server on port 5001..."
export PORT=5001
pnpm --filter @workspace/api-server run dev &

echo "Starting Killer Pool Frontend on port 5173..."
pnpm --filter @workspace/killer-pool run dev -- --host 127.0.0.1 --port 5173 &

echo "Servers are starting up. Press Ctrl+C to stop."
wait
