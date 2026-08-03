# Pac-Man (réplica en HTML/CSS/JS)

Recreación del Pac-Man clásico hecha con Canvas y JavaScript puro, sin dependencias ni build step.

## Cómo correrlo

**Opción 1 — directo (más simple):** doble clic en `index.html` y se abre en tu navegador.

**Opción 2 — Visual Studio Code:** instala la extensión "Live Server", clic derecho sobre `index.html` → "Open with Live Server".

## Controles

- Flechas o WASD: mover a Pac-Man
- Enter o clic/toque en la pantalla: iniciar / reiniciar partida
- M: silenciar/activar sonido

## Estructura

- `index.html` — estructura y HUD
- `style.css` — estilo arcade retro
- `maze.js` — layout del laberinto (28x31) y posiciones clave
- `audio.js` — efectos de sonido sintetizados (Web Audio API, sin archivos externos)
- `game.js` — motor del juego: movimiento, IA de fantasmas, colisiones, puntaje, estados

## Qué incluye

- Laberinto completo con túnel lateral y casa de fantasmas
- Pellets y power pellets (energizers)
- 4 fantasmas con personalidades distintas (Blinky, Pinky, Inky, Clyde), modos scatter/chase y modo asustado
- Vidas, puntaje, high score persistente, niveles progresivos
- Pantallas de inicio, "READY!", muerte, game over y nivel completado
- Controles táctiles en pantallas pequeñas
