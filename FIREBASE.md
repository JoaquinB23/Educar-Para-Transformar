# Firebase — reglas y despliegue

## Qué hay que desplegar

Sólo las **reglas de Firestore**. Los índices hoy están vacíos en
`firestore.indexes.json` porque las consultas del backend andan con el Admin SDK
sobre colecciones chicas; se van llenando si alguna consulta empieza a pedir un
índice compuesto.

```bash
# Instala la CLI la primera vez
npm install -g firebase-tools
firebase login

# Despliega sólo las reglas (no toca los datos)
firebase deploy --only firestore:rules

# O para probar todo el proyecto Firebase primero, en local
firebase emulators:start --only firestore
```

El proyecto sale de `.firebaserc`: `escuela1-cc5ed`.

## Qué permiten y qué no

`firestore.rules` sigue un criterio único: **el navegador nunca escribe, y sólo
lee su propio perfil.**

| Acción | Desde el navegador | Desde el backend |
|---|---|---|
| Leer `usuarios/{uid}` propio | permitido | permitido |
| Leer `usuarios/{uid}` de otro | **denegado** | permitido |
| Escribir `usuarios` | **denegado** | permitido |
| Cualquier otra colección | **denegado** | permitido |

El backend corre con el Admin SDK, que ignora estas reglas por completo. Por eso
los endpoints siguen funcionando sin cambios: no hay que tocar `API_Server.js`.

Sin esto, `html/login.html` leía `usuarios/{uid}` desde el cliente sin ninguna
restricción: cualquiera que supiera un UID podía leer el nombre, el rol y el
nivel de otro usuario.

## El único `getDoc` que queda en el cliente

`html/login.html` lee el perfil para validar que el rol y el nivel elegidos
coincidan con los del usuario. Es la única lectura directa que hace falta, y
está permitida justamente para el documento propio.

El resto de las páginas usan `window.fetchConAuth` de `js/auth-guard.js`, que
pasa el `idToken` al backend.

## `html/setup-usuarios.html` queda sin poder escribir

Esa página usaba `setDoc` desde el navegador para crear usuarios de prueba, así
que con estas reglas va a fallar con *permission-denied*. Es lo correcto: por ese
camino cualquiera se podía auto-asignar el rol `admin`.

Está huérfana (nadie la enlaza) y además ya no funciona por otros dos motivos:
importa `./js/firebase-config.js` cuando debería ser `../js/...`, y su ruta de
scripts está rota. Para dar de alta usuarios están `Backend/crear-usuario.js` y
`POST /api/admin/usuarios`. Conviene borrarla.

## Antes de exponer el sitio

`Backend/API_Server.js` sirve la raíz del repo con
`express.static(path.join(__dirname, '..'))`, así que hoy se pueden descargar
`/Backend/API_Server.js`, `/Backend/seed.js` y `/js/env.js`. `js/env.js`
contiene la `apiKey` de Firebase, que no es un secreto real (está pensada para
el cliente), pero el código del backend no debería ir por HTTP.

Si en algún momento se publica, hay que restringir `express.static` a
`html/`, `css/`, `js/` e `img/`. `Backend/.env` hoy está a salvo porque Express
niega los dotfiles por defecto, pero conviene no depender de ese detalle.
