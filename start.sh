#!/bin/bash

# Mata processos antigos com força
echo "🔪 Matando processos antigos..."
pkill -f "node monitor.js" || true
pkill -f "http.server 8080" || true

echo "🚀 Iniciando YouTube Grid Monitor..."
# Inicia o monitor em background e redireciona log
nohup node monitor.js > monitor.log 2>&1 &
MONITOR_PID=$!
echo "✅ Monitor rodando (PID: $MONITOR_PID)"

echo "🌐 Iniciando servidor HTTP..."
# Usando python3 ou python dependendo do sistema
if command -v python3 &> /dev/null; then
    nohup python3 -m http.server 8080 > server.log 2>&1 &
else
    nohup python -m http.server 8080 > server.log 2>&1 &
fi
SERVER_PID=$!

echo "⏳ Aguardando servidor iniciar..."
sleep 2

echo "🖥️  Abrindo navegador..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    open http://localhost:8080
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    xdg-open http://localhost:8080
fi

echo " "
echo "O script está rodando em segundo plano."
echo "Para parar tudo, feche este terminal ou rode: kill $MONITOR_PID $SERVER_PID"
