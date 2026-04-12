# Canastón - Especificación funcional para desarrollo

## 1. Resumen del juego
Canastón es un juego de cartas por equipos para 4 jugadores, divididos en 2 parejas. Se juega con 3 mazos y 6 jokers. El objetivo es acumular 15.000 puntos a lo largo de varias rondas. En cada ronda, los jugadores roban cartas, forman combinaciones del mismo valor, construyen canastas de 7 cartas iguales y gestionan cartas especiales como monos, honores, tapa y pilón.

## 2. Componentes del juego

### 2.1. Mazos y cartas
- Mazos: 3 mazos estándar de 52 cartas (156 cartas + 6 jokers = 162 cartas totales)
- Jokers: 6 (distinguibles de las cartas normales)
- Valores de cartas para puntuación:
  - 4, 5, 6, 7: 5 puntos
  - 8, 9, 10, J, Q, K: 10 puntos  
  - A, 2: 20 puntos
  - Joker: 50 puntos
  - 3 rojo: Honor (no puntúa en mano/mesa)
  - 3 negro: Tapa (no se usa en canastas)

### 2.2. Jugadores y equipos
- Jugadores: exactamente 4
- Equipos: 2 equipos de 2 jugadores cada uno
- Posiciones fijas en mesa: Norte-Sur vs Este-Oeste (o similar)
- Mano inicial: 15 cartas por jugador

### 2.3. Elementos del tablero
- Mazo (stock): pila de robo cerrada
- Pilón (discard): pila de descarte visible (última carta arriba)
- Mesa de cada equipo: cartas bajadas y canastas
- Marcador global: puntos acumulados de cada equipo

## 3. Terminología
PICA = jugador que pica el pilón previo a barajarse y que arranca la partida
MONO = 2 o Joker (pueden usarse como comodines)
HONOR = 3 rojo (puntos especiales al final)
TAPA = 3 negro (bloquea pilón temporalmente)
PILÓN TRIADO = pilón con mono descartado arriba (requiere 3 cartas iguales)
BAJADA = primera combinación válida de un equipo para empezar a jugar
CANASTA = 7 cartas del mismo valor
CANASTA LIMPIA = 7 cartas naturales (sin monos)
CANASTA SUCIA = 7 cartas con 1-2 monos máximo
IDA = terminar ronda quedándose sin cartas
MONO OBLIGADO = canasta de mono que, al jugarse, no permite utilizar monos en ninguna otra canasta hasta que se cierre
PATO = 2

## 4. Estados de juego

### 4.1. Lista de estados
- LOBBY: se crea la partida y esperan jugadores.
- SETUP: se forman equipos, se elige el orden y se prepara el mazo.
- SORTEO_EQUIPOS: cada jugador saca carta para definir pareja.
- PICADA_INICIAL: el jugador inicial pica el mazo y revisa las 3 últimas cartas.
- REPARTO_INICIAL: se reparten 15 cartas a cada jugador.
- INICIO_RONDA: el repartidor resuelve la primera carta visible del mazo, si aplica.
- TURNO_NORMAL: un jugador realiza su turno.
- RESOLUCION_PILON: el jugador intenta llevarse el pilón o roba del mazo.
- BAJADA: un equipo realiza su primera bajada válida.
- JUEGO_EN_MESA: los equipos pueden seguir bajando y completando canastas.
- CIERRE_RONDA: un jugador se queda sin cartas y termina la ronda.
- CONTEO_FINAL: se suman puntos de mano, mesa, canastas, honores e ida.
- NUEVA_RONDA: se prepara la siguiente ronda.
- FIN_PARTIDA: un equipo alcanza 15.000 puntos o más.

### 4.2. Regla general del estado
- En cada momento, el juego solo puede estar en un único estado.
- Las acciones del jugador solo son válidas si el estado actual las permite.
- Si un jugador intenta una acción no permitida, el sistema debe rechazarla.

### 4.3. Transiciones permitidas
LOBBY -> SETUP
SETUP -> SORTEO_EQUIPOS
SORTEO_EQUIPOS -> PICADA_INICIAL
PICADA_INICIAL -> REPARTO_INICIAL
REPARTO_INICIAL -> INICIO_RONDA
INICIO_RONDA -> TURNO_NORMAL
TURNO_NORMAL -> RESOLUCION_PILON
RESOLUCION_PILON -> BAJADA | JUEGO_EN_MESA | TURNO_NORMAL
BAJADA -> JUEGO_EN_MESA
JUEGO_EN_MESA -> CIERRE_RONDA
CIERRE_RONDA -> CONTEO_FINAL
CONTEO_FINAL -> NUEVA_RONDA | FIN_PARTIDA
NUEVA_RONDA -> PICADA_INICIAL

### 4.4. Reglas de implementación
- No se puede robar carta si no estás en TURNO_NORMAL.
- No se puede bajar si el equipo no cumple el mínimo de puntos.
- No se puede tomar el pilón si no se cumplen sus condiciones.
- No se puede terminar la ronda si el jugador no cumple las condiciones de ida.
- No se puede pasar a CONTEO_FINAL hasta que la ronda haya sido cerrada correctamente.

## 5. Setup

### 5.1. Creación de la partida
- La partida se crea con 4 jugadores.
- El sistema asigna dos equipos de 2 jugadores.
- El juego utiliza 3 mazos estándar y 6 jokers.
- El objetivo de la partida es llegar a 15.000 puntos acumulados.

### 5.2. Sorteo de equipos
- Cada jugador roba una carta del mazo para definir el orden inicial.
- Los dos jugadores con cartas más altas forman un equipo.
- Los dos jugadores con cartas más bajas forman el otro equipo.
- Si hay empate con la carta más alta, los jugadores empatados vuelven a robar y quien saque la más alta, pica.
- Si un jugador roba un joker o un 2, debe volver a robar.

### 5.3. Definición del jugador inicial
- El jugador con la carta más alta es el primer jugador de la ronda.
- Ese jugador también será quien realice la picada inicial.
- El jugador a la izquierda del que pica será el repartidor.

### 5.4. Preparación del mazo
- Se mezclan los 3 mazos y los 6 jokers.
- El mazo se coloca boca abajo en el centro de la mesa.
- No debe haber cartas visibles antes de la picada inicial.

### 5.5. Estado inicial del juego
- Marcador global de ambos equipos: 0.
- Manos de los jugadores: vacías.
- Pilón: vacío.
- Canastas: vacías.
- Estado del juego: PICADA_INICIAL.

### 5.6. Reglas de implementación
- El setup debe ejecutarse exactamente una vez por partida.
- Si hay menos de 4 jugadores, el estado queda bloqueado en LOBBY.
- El sorteo de equipos debe generar un array ordenado: [jugador1, jugador2, jugador3, jugador4].
- El sistema debe almacenar permanentemente qué equipo es Norte-Sur y cuál Este-Oeste.
- Después del setup, el estado debe cambiar automáticamente a PICADA_INICIAL.
- No se puede empezar una ronda nueva hasta completar CONTEO_FINAL de la anterior.

## 6. Inicio de ronda

### 6.1. Picada inicial
- Estado: PICADA_INICIAL
- Solo el jugador inicial puede actuar.
- El jugador pica el mazo por donde quiera (el sistema simula esto).
- El sistema muestra las 3 últimas cartas del paquete picado.
- Si alguna de las 3 cartas es mono (2 o Joker) u honor (3 rojo):
  - El jugador se las queda en su mano.
  - El mazo se coloca como pilón.
- Si no hay cartas especiales:
  - Las 3 cartas vuelven bajo el mazo.
  - El mazo se coloca en el centro.

### 6.2. Reparto inicial
- Estado: REPARTO_INICIAL
- El jugador a la izquierda del que picó reparte.
- Se reparten 3 cartas a cada jugador, empezando por el que picó.
- El reparto continúa hasta que todos tengan 15 cartas.
- Si el que picó se quedó con cartas especiales, el reparto se ajusta:
  - Ejemplo: si se quedó con 1 Joker, recibe 14 cartas más.
  - Ejemplo: si se quedó con 2 cartas especiales, recibe 13 cartas más.

### 6.3. Carta visible del repartidor
- Estado: INICIO_RONDA
- Cuando termina el reparto, el repartidor voltea la primera carta de su mazo.
- Según la carta volteada:

| Carta | Acción |
|-------|--------|
| Numérica (4-10) | Poner boca abajo tantas cartas como indique el número |
| J (11), Q (12), K (13), A (14) | Poner boca abajo 11/12/13/14 cartas |
| 3 rojo | Voltear la siguiente carta y repetir |
| 2 o Joker | Poner boca abajo 20/25 cartas |

### 6.4. Inicio del primer turno
- Después de resolver la carta del repartidor, el estado cambia a TURNO_NORMAL.
- El primer turno lo juega el jugador que picó.

### 6.5. Reglas de implementación
- La picada debe ser simulada aleatoriamente por el sistema.
- Las cartas especiales que se queda el jugador van directamente a su mano.
- El reparto debe contar correctamente las cartas especiales previas.
- La carta del repartidor puede generar un pilón inicial con varias cartas.
- No se puede empezar TURNO_NORMAL hasta completar todo el proceso.
- El sistema debe validar que todos los jugadores tengan exactamente 15 cartas.

## 7. Estructura del turno

### 7.1. Inicio del turno
- Estado: TURNO_NORMAL
- Es el turno de un jugador específico.
- El jugador debe elegir una de estas 2 opciones **exclusivas**:
  1. Robar 2 cartas del mazo (stock).
  2. Intentar llevarse el pilón (ver sección 8).

### 7.2. Después de robar del mazo
- El jugador recibe exactamente 2 cartas del mazo.
- Ahora puede hacer **cero o más** de estas acciones, en cualquier orden:
  1. Bajar nuevas combinaciones (si el equipo no ha hecho bajada inicial).
  2. Completar canastas propias o del compañero.
  3. Reorganizar cartas en mesa (siempre que sean válidas).
- **Obligación**: descartar exactamente 1 carta al pilón para terminar el turno.

### 7.3. Orden de juego
- El turno pasa al siguiente jugador en sentido contrario a las agujas del reloj.
- El primer turno de la ronda lo hace el jugador que picó.

### 7.4. Acciones permitidas según estado del equipo
| Estado del equipo | Puede bajar nuevas?   | Puede completar canastas? |
| ----------------- | --------------------- | ------------------------- |
| Sin bajada        | Solo si cumple mínimo | No                        |
| Con bajada        | Sí                    | Sí                        |


### 7.5. Reglas de implementación
- Un jugador solo puede estar en un estado de turno a la vez.
- No se puede robar del mazo y del pilón en el mismo turno.
- Después de robar del mazo, el descarte es OBLIGATORIO.
- El sistema debe validar que las combinaciones bajadas sean válidas.
- Si el equipo no ha hecho bajada, validar el mínimo de puntos requerido.
- El turno termina automáticamente al descartar.
- No se puede terminar turno sin descartar exactamente 1 carta.

## 8. Reglas del pilón

### 8.1. Cómo tomar el pilón
- El jugador puede intentar tomar el pilón en lugar de robar del mazo.
- Para tomar el pilón, debe cumplir estas condiciones:

| Estado del pilón | Cartas requeridas | Ejemplo |
|------------------|-------------------|---------|
| Normal           | 2 cartas iguales a la visible | Visible: 7♥ → tener 2 sietes |
| Triado           | 3 cartas iguales a la visible | Visible: 7♥ (triado) → tener 3 sietes |
| Con tapa         | No se puede tomar | Visible: 3♠ → bloquear |

### 8.2. Pilón triado
- Se activa cuando se descarta un mono (2 o Joker) encima del pilón.
- El pilón queda triado hasta que alguien se lo lleve.
- Requiere exactamente 3 cartas iguales a la carta visible.
- El tipo de mono descartado NO importa; solo cuenta que haya un mono arriba.

### 8.3. Tapa (3 negro)
- Si se descarta un 3 negro, el siguiente jugador NO puede tomar el pilón.
- La tapa dura SOLO el siguiente turno.
- El jugador siguiente debe robar del mazo obligatoriamente.
- Una nueva carta encima del 3 negro reactiva el pilón normalmente.

### 8.4. Cartas del pilón
- Al tomar el pilón, el jugador recibe TODAS las cartas del pilón.
- Debe usar la carta visible + las cartas requeridas para formar una combinación válida.
- Las cartas sobrantes van a su mano.
- Las cartas usadas para tomar el pilón NO cuentan ni suman para la bajada inicial.

### 8.5. Reglas de implementación
- Validar estado del pilón antes de permitir la acción.
- Si pilón vacío → no se puede tomar.
- Si tapa activa → rechazar intento de tomar.
- Si triado → validar exactamente 3 cartas iguales.
- Las cartas requeridas deben estar en mano del jugador.
- Después de tomar pilón, el jugador pasa a JUEGO_EN_MESA o BAJADA.
- Actualizar estado del pilón a vacío.

## 9. Reglas de bajada

### 9.1. Bajada inicial del equipo
- Cada equipo solo puede hacer UNA bajada inicial por ronda.
- Para hacer bajada, el equipo debe alcanzar el mínimo según su marcador global:

| Puntos globales | Mínimo requerido |
|-----------------|------------------|
| 0-2999          | 50               |
| 3000-4999       | 90               |
| 5000-7999       | 120              |
| 8000-9999       | 160              |
| 10000-11999     | 180              |
| 12000-14999     | 200              |

### 9.2. Qué se puede usar para la bajada
- Combinaciones válidas: tríos.
- Se pueden usar monos (2 o Joker) para completar combinaciones.
- Ejemplos válidos: 
    - 2 ases + 1 pato = 3 ases (60 puntos).
    - 2 ases + 2 jokers = 4 ases (140 puntos)
- Ejemplos inválidos (siempre deben haber por lo menos dos cartas del trío para utilizar un mono):
    - 1 as + 2 patos 
    - 1 as + 1 joker + 1 pato
- Una vez hecha la bajada, ambos jugadores del equipo pueden jugar libremente.

### 9.3. Mono obligado
- Si se baja una canasta de monos, queda OBLIGADO.
- Los monos no pueden utilizarse en otra combinación hasta completar la canasta de monos (7 monos).
- Ejemplo: si bajas una canasta de 3 patos, ningún mono puede utilizarse en otra canasta hasta cerrar la de monos.

### 9.4. Después de la bajada
- El equipo pasa a estado JUEGO_EN_MESA.
- Ambos jugadores pueden bajar y completar canastas sin mínimo.
- La bajada inicial NO se puede repetir en la misma ronda.

### 9.5. Reglas de implementación
- Calcular mínimo según marcador global del equipo.
- Validar que la suma de puntos de las cartas bajadas >= mínimo.
- Marcar el equipo como "ha_bajado: true" después de la primera bajada.
- Validar que los monos obligados respeten su combinación original.
- Las cartas del pilón usadas para tomar NO cuentan para bajada.
- Rechazar bajada si el equipo ya hizo bajada en esta ronda.

## 10. Canastas

### 10.1. Definición de canasta
- Una canasta es EXACTAMENTE 7 cartas del mismo valor.
- Ejemplos válidos:
  - 7♥, 7♦, 7♣, 7♠, 7♥, 7♦, 7♣ (limpia)
  - 5♥, 5♦, 5♣, 5♠, Joker, 2♥, 5♥ (sucia, 2 monos)

### 10.2. Tipos de canasta
| Tipo   | Composición                  | Monos permitidos |
| ------ | ---------------------------- | ---------------- |
| Limpia | 7 cartas naturales           | 0                |
| Sucia  | 5-6 cartas naturales + monos | 1-2 máximo       |

### 10.3. Valores de canastas
| Valor de cartas               | Limpia | Sucia |
| ----------------------------- | ------ | ----- |
| 4, 5, 6, 7, 8, 9, 10, J, Q, K | 500    | 300   |
| Ases (A)                      | 1000   | 500   |
| Doses (2)                     | 3000   | 2000  |
| Jokers                        | 4000   | 2000  |


### 10.4. Puntos adicionales de las cartas
- TODAS las cartas dentro de una canasta suman sus puntos individuales.
- Ejemplo: Canasta limpia de sietes = 500 (base) + 35 (7×5) = 535 puntos.
- Los monos dentro de la canasta suman su valor normal (patos 20 o jokers 50).

### 10.5. Quemar cartas
- Si un equipo ha cerrado una canasta, no puede volver a bajar un trío de la misma canasta.
- Una vez cerrada una canasta, cartas del mismo tipo pueden quemarse, añadiéndolas a la canasta, por ejemplo:
    - Canasta limpia de sietes cerrada (7 sietes) y el jugador del equipo quema dos sietes más, por lo que la canasta tendrá 9 sietes (7 del cierre + 2 quemados).
- La suma de la canasta incluirá a todas las cartas quemadas en la misma, por ejemplo:
    - Canasta limpia de sietes y dos quemados = 500 (base) + 35 (7×5) + 10 (2x5) = 545 puntos.

### 10.6. Reglas de implementación
- Validar que una combinación tenga exactamente 7 cartas.
- Contar monos en la combinación (<=2 para sucia).
- Clasificar como limpia (0 monos) o sucia (1-2 monos).
- Calcular valor base según el rango de cartas.
- Sumar puntos individuales de TODAS las cartas de la canasta.
- Una vez completada (7 cartas), marcar como "cerrada".
- No permitir más de 2 monos por canasta.

## 11. Honores

### 11.1. Definición de honor
```md
- Honor = 3 rojo (♥ o ♦).
- Los honores NO se usan en canastas ni combinaciones.
- Solo aportan puntos al final de la ronda.
```

### 11.2. Durante la partida
```md
- Si un jugador tiene un honor en mano, DEBE bajarlo en su turno.
- Al bajarlo, roba 1 carta del mazo para reemplazarlo.
- Los honores bajados quedan visibles en mesa del equipo.
```

### 11.3. Puntuación de honores
La puntuación depende del TIPO DE CIERRE del equipo:

| Cantidad | Con limpia + sucia | Solo limpia | Sin limpia |
|----------|--------------------|-------------|------------|
| 1 honor  | +100               | 0           | -200       |
| 2 honores| +200               | 0           | -400       |
| 3 honores| +600               | 0           | -1200      |
| 4 honores| +800               | 0           | -1600      |
| 5 honores| +1000              | 0           | -2000      |
| 6 honores| +2000              | 0           | -4000      |

### 11.4. Reglas de implementación
- Detectar automáticamente si un jugador tiene honor en mano.
- Forzar bajada de honor + robo de reemplazo.
- Contar honores por equipo al final de ronda.
- Determinar tipo de cierre:
  - "limpia_sucia" = tiene al menos 1 limpia Y 1 sucia
  - "solo_limpia" = tiene limpia(s) pero NO sucia
  - "sin_limpia" = NO tiene limpia (pueden tener sucia o nada)
- Aplicar puntuación según tabla.

## 12. Ida

### 12.1. Condiciones para irse
Un jugador solo puede terminar la ronda si:
1. Su equipo tiene al menos 1 canasta LIMPIA y 1 canasta SUCIA.
2. Al descartar su última carta, NO es mono (2/Joker) ni 3 negro.

### 12.2. Bonificación por ida
| Tipo de ida                 | Puntos |
| --------------------------- | ------ |
| Ida simple                  | +300   |
| Con 3-5 tres negros en mano | +300   |
| Con 6 tres negros en mano   | +600   |


### 12.3. Excepción de tres negros
- Si el jugador tiene 3 o más tres negros en mano al final:
  - Puede descartar otra carta válida (no mono).
  - Los tres negros quedan en mano y cuentan como +5 cada uno.

### 12.4. Flujo de la ida
1. Jugador descarta su última carta válida.
2. Sistema valida condiciones de ida.
3. Si OK → estado CIERRE_RONDA.
4. El equipo recibe bonificación por ida.

### 12.5. Reglas de implementación
- Validar que el equipo tenga >=1 limpia Y >=1 sucia.
- Validar que el descarte final no sea mono ni 3 negro.
- Contar tres negros en mano del jugador que se va.
- Si 3+ tres negros → permitir ida con descarte alternativo.
- Sumar bonificación: 300 base, +300 extra si 6 tres negros.
- Los tres negros en mano cuentan +5 cada uno en puntuación final.

## 13. Puntuación

### 13.1. Orden de conteo
Al final de la ronda (estado CONTEO_FINAL), sumar en este orden:
1. Valor de todas las canastas cerradas.
2. Puntos de cartas dentro de las canastas.
3. Honores según tipo de cierre.
4. Bonificación por ida (si aplica).
5. Mano de los jugadores del equipo que NO se fue (positiva o negativa).
6. Mano del jugador que se fue.

### 13.2. Reglas de mesa según cierre
| Cierre del equipo | Canastas | Cartas en mesa sueltas | Mano   |
| ----------------- | -------- | ---------------------- | ------ |
| Con limpia        | Suman    | Suman                  | Restan |
| Solo sucia        | Suman    | 0                      | Restan |
| Sin limpia/sucia  | 0        | Restan                 | Restan |


### 13.3. Tres negros en mano del que se va
- Cada 3 negro en mano del jugador que se fue: +5 puntos.
- NO cuentan como tapa ni honor en este contexto.

### 13.4. Ejemplo de cálculo
Equipo A se va con ida simple:
- 1 canastas limpias de 7s: (500 + 35) = 535
- 1 canasta sucia de Ases: 500 + (6×20 + 50) = 670  
- 3 honores (limpia+sucias): +600
- Ida simple: +300
- Mano del compañero: -45
- Mano del que se fue: +15
TOTAL: 535 + 670 + 600 + 300 - 45 + 15 = 2075

### 13.5. Reglas de implementación
- Determinar tipo de cierre contando canastas limpias/sucias.
- Sumar valor base de canastas + cartas internas SIEMPRE.
- Aplicar reglas de mesa según tabla.
- Calcular honores por equipo según su cierre.
- Sumar bonificación de ida si aplica.
- Restar las cartas de mano de los jugadores que NO se fueron.
- Actualizar marcador global del equipo.
- Recalcular mínimo de bajada para próxima ronda.

## 14. Fin de partida

### 14.1. Condición de victoria
- Un equipo gana cuando su marcador global >= 15.000 puntos.
- Se comprueba después de cada CONTEO_FINAL.
- Si ambos equipos sobrepasan los 15.000 puntos, gana el que tenga la puntuación más alta.

### 14.2. Flujo de fin de partida
1. CONTEO_FINAL de una ronda.
2. Actualizar marcador global del equipo ganador de la ronda.
3. Si equipo >= 15.000 → mostrar "Equipo X gana" y terminar partida.
4. Si no → volver a PICADA_INICIAL para nueva ronda.

### 14.3. Empate
- Si ambos equipos sobrepasan los 15.000 puntos y tienen la misma puntuación, la partida termina en empate.

### 14.4. Reglas de implementación
- Después de cada CONTEO_FINAL, comparar marcadores globales.
- Si max(marcador_equipo1, marcador_equipo2) >= 15000:
  - Terminar partida.
  - Mostrar equipo ganador.
  - Mostrar puntuación final.
- Guardar estadísticas de partida completa.
- Permitir reiniciar nueva partida desde LOBBY.

## 15. Casos especiales

### 15.1. Mazo agotado
- Si el mazo se acaba completamente y el último jugador NO puede tomar el pilón, la partida se termina.

### 15.2. Reglas de implementación
- Implementar todas las validaciones de casos edge.
- Nunca permitir estados inválidos del juego.
- Si ocurre situación no prevista, mostrar "Error: estado no contemplado".
- Loguear todos los casos especiales para debugging.
- El sistema debe ser robusto ante cualquier combinación de cartas.