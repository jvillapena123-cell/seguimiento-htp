# Seguimiento de compromisos y hallazgos · HTP

Aplicación web para registrar compromisos y hallazgos, asignar responsables y cerrarlos con comentario y evidencia objetiva.
Se publica gratis con **GitHub Pages**. Los datos, los usuarios y las evidencias se guardan en **Firebase** (plan gratuito Spark).

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | La aplicación completa |
| `firebase-config.js` | Datos de conexión a su proyecto Firebase (hay que completarlo) |
| `firestore.rules` | Reglas de seguridad que se pegan en Firebase |

## Paso 1 · Crear el proyecto en Firebase

1. Entre a https://console.firebase.google.com con su cuenta Google y toque **Crear un proyecto**. Puede llamarlo `htp-seguimiento`. Google Analytics no es necesario.
2. **Authentication** > **Comenzar** > pestaña **Método de acceso** > habilite **Correo electrónico/contraseña** y guarde.
3. **Firestore Database** > **Crear base de datos** > ubicación `southamerica-east1 (São Paulo)` > **modo de producción**.
4. En Firestore, pestaña **Reglas**: borre lo que aparece, pegue todo el contenido de `firestore.rules`, reemplace `tu_correo@dominio.cl` por **su correo en minúsculas** y toque **Publicar**.
5. Engranaje **Configuración del proyecto** > **General** > **Sus apps** > ícono **</>** (app web). Póngale un nombre y regístrela (no active Hosting). Copie los valores del bloque `firebaseConfig`.

No necesita activar Storage: las evidencias se guardan dentro de Firestore, lo que permite seguir en el plan gratuito.

## Paso 2 · Completar `firebase-config.js`

Reemplace cada `PEGAR_...` por los valores copiados y ponga su correo en `ADMIN_EMAILS` (el mismo de las reglas).
La `apiKey` de Firebase no es una contraseña: es normal que quede visible. La seguridad la dan las reglas del paso 1.

## Paso 3 · Publicar en GitHub Pages

1. En https://github.com cree un repositorio nuevo, por ejemplo `seguimiento-htp`.
2. **Add file** > **Upload files**: suba `index.html`, `firebase-config.js`, `firestore.rules` y `README.md`. Toque **Commit changes**.
3. **Settings** > **Pages** > en *Branch* elija `main` y carpeta `/ (root)` > **Save**.
4. En uno o dos minutos la página queda en `https://SU-USUARIO.github.io/seguimiento-htp/`.
5. Vuelva a Firebase: **Authentication** > **Configuración** > **Dominios autorizados** > **Agregar dominio** > `SU-USUARIO.github.io`.

GitHub Pages gratis requiere que el repositorio sea **público**. Eso deja visible el código, no los datos: sin usuario autorizado nadie puede leer los registros.

## Paso 4 · Primer ingreso (administrador)

1. Abra la página y toque **Crear mi contraseña** con el correo de administrador.
2. Abra el enlace de verificación que llega a su correo (revise spam) y toque **Ya verifiqué mi correo**.
3. En **Administración**, agréguese a sí mismo con acceso **Administrador**.
4. Toque **Cargar compromisos iniciales** para cargar los 20 compromisos de la reunión del 05-10-2026.
5. Agregue a las demás personas con su correo.

## Accesos

| Acceso | Qué puede hacer |
|---|---|
| Administrador | Todo, además gestionar personas, reasignar responsables, reabrir y eliminar |
| Usuario | Ver, registrar compromisos y hallazgos, cambiar estados y cerrar lo que tiene asignado |
| Lector | Solo ver |
| Sin acceso | No ingresa; solo figura como responsable |

Para invitar a alguien: agréguelo en Administración y envíele el enlace de la página. La primera vez toca **Crear mi contraseña** con ese mismo correo.

## Cómo se cierra un compromiso o hallazgo

Solo el responsable asignado ve el botón **Cerrar**. Debe escribir un comentario y adjuntar una foto o un PDF (hasta 700 KB; las fotos se comprimen solas).
Esto lo controlan las reglas de Firebase en el servidor, no solo la página: nadie más puede cerrar el registro aunque lo intente por otro medio.
El administrador puede reabrir un registro indicando el motivo; el cierre anterior queda guardado.

## Límites del plan gratuito

1 GiB de datos y 50.000 lecturas diarias. Con evidencias de hasta 700 KB caben del orden de mil cierres. Si se acerca al límite, puede pasar al plan Blaze (pago por uso) sin cambiar nada de la aplicación.

## Actualizar la aplicación

Edite `index.html` en GitHub (ícono de lápiz) o suba una nueva versión. GitHub Pages publica los cambios en uno o dos minutos. Los datos no se tocan.

## Seguimiento de mejoras (proyectos)

Pestaña visible para todos los que tienen acceso Lector, Usuario o Administrador.
- **Menú de proyectos** (izquierda): el administrador agrega proyectos con **+ Nuevo** y los quita con **Eliminar proyecto** (se borran también sus tareas y compromisos).
- Cada proyecto tiene **tareas** (T-01, T-02…) y **compromisos** (C-01, C-02…), cada uno con responsable, fecha compromiso y prioridad. Los responsables salen de la lista de personas de **Administración** (marcadas "Puede ser responsable").
- El responsable asignado cambia el estado (Pendiente / En proceso / Bloqueado) y cierra solo con comentario y evidencia (foto o PDF). Para cerrar necesita acceso Usuario o Administrador.
- **Resumen general**: porcentaje de cumplimiento por proyecto (cerrados / total), vencidos y próximos a vencer.

Datos en Firestore: colecciones `proyectos` y `mejoras`. Requiere publicar el `firestore.rules` actualizado.

### Etapas de design thinking
Cada tarea o compromiso nuevo trae automáticamente las 5 etapas: **Empatizar, Definir, Idear, Prototipar y Testear** (se puede desmarcar al crearlo).
- En la lista, bajo cada tarea, una barra de 5 segmentos muestra el avance y la etapa actual.
- En el detalle, el administrador o el responsable marcan cada etapa como Pendiente / En curso / Hecha y dejan una nota. Al marcar una como Hecha, la siguiente pasa a En curso. Los cambios quedan en el historial.
- Las tareas creadas antes de este cambio también muestran las etapas (todas pendientes).
- El CSV incluye la columna "Etapa design thinking". Requiere publicar el `firestore.rules` actualizado para que el responsable pueda avanzar etapas.

## Mantenimiento de equipos

Pestaña visible solo para el administrador y las personas marcadas como **Jefe de turno** en Administración (igual que Tareas de turno). El responsable de una solicitud que no es jefe de turno recibe los correos, pero no entra a la pestaña.
- **Equipos**: LSur (C-32, C-33, C-34, Apilador ST34), LNorte (MKS1, Apilador Sumitomo) y TTMM (C-31, TD3). Tocando un equipo o un área se filtran sus solicitudes.
- **Nueva solicitud** (jefes de turno y administrador): equipo, descripción del problema, al menos una foto (hasta 3), N° de aviso SAP, prioridad, fecha comprometida (opcional), **responsable** y **jefe de turno** que hace el seguimiento.
- Al crearla, o si cambia el responsable o el jefe de turno, cada uno recibe un correo con la solicitud y la foto (lo envía la misma automatización de GitHub Actions de Tareas de turno, cada 15 minutos).
- Quien la creó, el responsable y el jefe de turno pueden editarla (aviso SAP, fecha, estado: Pendiente / En proceso / Esperando repuesto). El responsable o el jefe de turno la cierran con comentario y evidencia; se avisa por correo al jefe de turno y a quien la solicitó.

Datos en Firestore: colección `mantenimiento`. Requiere publicar el `firestore.rules` actualizado.
