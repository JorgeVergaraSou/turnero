# Pantalla de la sala de espera: instalación y uso

Cómo conectar un televisor a la sala de espera para que, cuando el médico llama a un paciente, la pantalla muestre su nombre y el consultorio, suene un timbre y una voz lo diga en voz alta.

**Para quién es:** quien instala o administra el consultorio. No hace falta saber programar.

## Cómo funciona (en 30 segundos)

1. El médico toca **Llamar** al lado del paciente que espera.
2. La pantalla de la sala muestra el nombre y el consultorio en grande, suena un timbre corto y una voz lo repite.
3. Abajo se ven los últimos llamados.

La pantalla no es un usuario del sistema: se conecta con un **token** propio (una clave larga) que solo sirve para ver los llamados. No puede ver turnos, historias clínicas ni nada más.

## Qué necesitás

- Un televisor con navegador, o una PC/mini PC conectada a la TV por HDMI. **Lo más simple y probado es una PC con Google Chrome.**
- Que el televisor o la PC pueda abrir la dirección del sistema (la misma red del consultorio, o internet).
- Parlantes: los de la TV alcanzan.
- Una voz en español instalada en el sistema (ver [Voces](#voces-en-español)).

## Paso a paso

### 1. Crear la pantalla (administrador)

1. Entrá al sistema como administrador.
2. Andá a **Administración → Pantallas de sala**.
3. Tocá **Nueva pantalla**, escribí un nombre que la identifique (por ejemplo «TV sala de espera») y **Crear pantalla**.
4. Aparece el **token** y un **enlace para abrir en el televisor**. **Copialos ahora: por seguridad no se vuelven a mostrar.** Si los perdés, se genera uno nuevo con **Cambiar token** (el anterior deja de funcionar).

### 2. Abrir la pantalla en el televisor

Abrí en el navegador del televisor el **enlace** que copiaste. Tiene esta forma:

```
https://tu-consultorio.com/pantalla#token=dsp_...
```

- El token se guarda en ese navegador y se borra de la barra de direcciones. La próxima vez alcanza con abrir `https://tu-consultorio.com/pantalla`.
- Si no podés usar el enlace (por ejemplo, escribir en un televisor es incómodo), abrí solo `/pantalla` y pegá el token en el formulario **Configurar esta pantalla**.

### 3. Activar el sonido

El navegador no deja sonar nada hasta que alguien toca la página. Tocá el botón amarillo **Activar sonido** (arriba a la derecha): confirma con un timbre y la frase «Sonido activado.».

- Después queda como «Sonido activo». Tocarlo otra vez silencia.
- Si el televisor no tiene voz en español, aparece un aviso amarillo durante 30 segundos. Ver [Voces](#voces-en-español).

### 4. Probar

Pedile a un médico que llame a un paciente de prueba. Tiene que aparecer el nombre, sonar el timbre y decirse dos veces.

## Dejarla funcionando sola (modo quiosco)

Para que la pantalla ocupe todo el televisor y arranque sin que nadie toque nada, en una PC con Chrome:

1. Creá un acceso directo a Chrome y en **Destino** agregá al final:

   ```
   --kiosk --autoplay-policy=no-user-gesture-required https://tu-consultorio.com/pantalla
   ```

   - `--kiosk`: pantalla completa, sin barras.
   - `--autoplay-policy=no-user-gesture-required`: permite el sonido sin tocar «Activar sonido».
2. La primera vez, cargá el token (con el enlace `…/pantalla#token=…` o pegándolo en el formulario). Queda guardado en el perfil de Chrome.
3. Poné el acceso directo en la carpeta de **Inicio** de Windows (`shell:startup`) para que arranque con la PC.
4. En Windows, desactivá la suspensión de pantalla y del equipo (Configuración → Sistema → Inicio/apagado y suspensión → «Nunca»).

> Esta guía describe el modo quiosco de Chrome en Windows. Se probó la pantalla, el sonido y el cambio de configuración en Chrome de escritorio; **no se probó en un televisor con sistema propio** (Android TV, Samsung, LG, etc.). Probá primero con el televisor real antes de dejarlo instalado.

## Voces en español

La voz que dice los nombres es la del sistema operativo del equipo, no del sistema de turnos. Por eso depende del televisor o de la PC:

- **Windows:** Configuración → Hora e idioma → Voz → **Agregar voces** → elegí un idioma español (por ejemplo «Español (México)» o «Español (España)»). Reiniciá Chrome.
- **Android TV / Smart TV:** muchos solo traen voces en inglés o ninguna. Si aparece el aviso de «no tiene una voz en español», usá una PC o un dispositivo con Chrome.
- La pantalla elige sola la mejor voz en español disponible (primero la rioplatense, después otras latinoamericanas y por último cualquier español).

Si no hay ninguna voz, solo se oye el timbre y el nombre se ve en pantalla.

## Configuración

En **Administración → Configuración → Llamado de pacientes**:

| Opción | Qué hace |
|---|---|
| **El llamado de pacientes está activado** | Si lo desactivás, los médicos no ven el botón **Llamar** y las pantallas dejan de mostrar nombres («Llamados desactivados»). |
| **Cómo se nombra al paciente** | **Nombre y apellido** (Juan Pérez), **Nombre e inicial del apellido** (Juan P.) o **Solo el código del turno** (K7M2Q 9XW4P). |
| **Veces que se repite la voz** | 1, 2 o 3 veces. |

Los cambios llegan solos a las pantallas conectadas, sin recargar.

**Sobre la privacidad:** en una sala de espera cualquiera ve la pantalla. «Nombre e inicial» y sobre todo «código» muestran menos. Con estas dos opciones, el apellido completo ni siquiera sale del servidor hacia la pantalla. Con el código, el paciente tiene que conocer el suyo (lo ve en el comprobante del turno). Para quien reservó sin cuenta, ese código junto con su DNI permite consultar o cancelar el turno; sin el DNI no alcanza.

## Cambiar o quitar una pantalla

En **Administración → Pantallas de sala**:

- **Cambiar token:** si se perdió o alguien lo vio. El anterior deja de funcionar al instante y la pantalla conectada se corta; hay que cargar el nuevo.
- **Desactivar:** corta la pantalla y no la deja volver a conectarse. **Activar** la habilita de nuevo.
- La lista muestra cuándo se conectó por última vez cada pantalla.

Todo queda registrado en **Auditoría** (sin el token).

## Si la pantalla está detrás de un servidor web (nginx)

Los llamados viajan por una conexión que se mantiene abierta (Server-Sent Events). Si el sistema se publica con **nginx** u otro proxy, hace falta desactivar el almacenamiento en búfer y subir el tiempo de espera para esa ruta; si no, los llamados llegan tarde o no llegan:

```nginx
location /api/display/stream {
    proxy_pass http://127.0.0.1:3006;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_buffering off;          # entregar cada evento apenas sale
    proxy_cache off;
    proxy_read_timeout 3600s;     # mucho mayor que el latido (cada 20 s)
    chunked_transfer_encoding on;
}
```

Si el proxy está delante del sistema, configurá también `TRUST_PROXY` (ver la guía de producción) para que el límite de pedidos cuente bien las direcciones.

## Problemas frecuentes

| Qué pasa | Qué hacer |
|---|---|
| Aparece **«Configurar esta pantalla»** | No hay token cargado. Pegá el token o abrí el enlace con `#token=`. |
| Dice **«Esta pantalla ya no está autorizada»** | El token se cambió o la pantalla se desactivó. Pedile al administrador un token nuevo (Pantallas de sala → Cambiar token). |
| Arriba dice **«Reconectando…»** | Se cortó la conexión con el servidor. Reintenta sola con espera creciente. Si persiste, revisá la red y que el sistema esté encendido. |
| Se ve el nombre pero **no suena** | Tocá **Activar sonido**. Revisá el volumen del televisor y que Chrome no esté silenciado. |
| Suena el timbre pero **no se oye la voz** | El equipo no tiene voz en español (ver [Voces](#voces-en-español)). |
| Los nombres suenan raro o en otro idioma | Se está usando una voz que no es española. Instalá una voz en español. |
| Los llamados llegan con demora | Si hay nginx u otro proxy, revisá la sección de arriba (`proxy_buffering off`). |
| Aparece **«Llamados desactivados»** | El administrador lo desactivó en Configuración. |
| El médico no ve el botón **Llamar** | Solo aparece para pacientes **confirmados** (en sala de espera) del día de hoy, y con el sistema activado. |

## Reglas del llamado (para que no sorprendan)

- Solo se llama a pacientes **confirmados** y **del día**. Hoy el sistema usa el estado «Confirmado» como «está en la sala de espera»: no distingue entre quien llegó al consultorio y quien confirmó por teléfono. Recepción tiene que confirmar la asistencia cuando el paciente llega.
- Cada turno se puede llamar **hasta 5 veces**, con al menos **15 segundos** entre un llamado y el siguiente.
- Solo el médico dueño del turno puede llamar a ese paciente.
- La pantalla muestra los últimos **5 llamados** y, al encenderse, recupera los de las últimas 12 horas.
- Cada llamado queda registrado en Auditoría («Llamó a un paciente a la sala»), sin datos clínicos.
