/** 中文 (por defecto) / Español. Los textos se escriben en español y aquí está su traducción. */
import { useSyncExternalStore } from "react";

export type Lang = "es" | "zh";

const ZH: Record<string, string> = {
  "Escanear": "扫码",
  "Escanear producto": "扫描商品",
  "Subir albarán": "上传送货单",
  "Albaranes": "送货单",
  "Productos de la caja": "收银系统商品",
  "Inicio": "首页",
  "Ajustes": "设置",
  "Idioma": "语言",
  "Volver": "返回",
  "Guardar": "保存",
  "Cancelar": "取消",
  "Borrar": "删除",
  "Buscar": "搜索",
  "Código de barras": "条码",
  "Referencia": "货号",
  "Descripción": "品名",
  "Cantidad": "数量",
  "Precio": "单价",
  "Dto %": "折扣 %",
  "Importe": "金额",
  "Proveedor": "供应商",
  "Número": "单号",
  "Fecha": "日期",
  "Total": "合计",
  "líneas": "行",
  "PVP": "售价",
  "Coste": "进价",
  "Stock": "库存",
  "Nombre": "名称",
  "Elegir archivo": "选择文件",
  "Hacer foto": "拍照",
  "PDF, Excel o foto del albarán o factura": "送货单或发票的 PDF、Excel 或照片",
  "Leyendo documento…": "正在读取文件…",
  "Revisa las líneas antes de guardar": "保存前请检查每一行",
  "Toca una celda para corregirla": "点击单元格可修改",
  "Añadir línea": "添加一行",
  "Quitar": "移除",
  "Guardar albarán": "保存送货单",
  "Albarán guardado": "送货单已保存",
  "No se ha encontrado ninguna línea de producto.": "没有找到商品行。",
  "Este PDF es escaneado (es una imagen). Para leerlo hará falta la lectura con IA, que llegará pronto. Mientras tanto puedes añadir las líneas a mano.":
    "这个 PDF 是扫描件（图片）。需要 AI 识别，即将推出。现在可以手动添加。",
  "La lectura de fotos con IA llegará pronto. Mientras tanto puedes añadir las líneas a mano.":
    "AI 照片识别即将推出。现在可以手动添加。",
  "No se pudo leer el archivo.": "无法读取文件。",
  "Apunta la cámara al código de barras": "将摄像头对准条码",
  "Escribir código": "输入条码",
  "No se pudo abrir la cámara. Revisa los permisos del navegador.": "无法打开摄像头，请检查浏览器权限。",
  "En albaranes": "送货单记录",
  "No aparece en ningún albarán.": "没有出现在任何送货单中。",
  "No está en los productos de la caja.": "不在收银系统商品中。",
  "Escanear otro": "继续扫码",
  "Sin albaranes todavía.": "还没有送货单。",
  "¿Borrar este albarán?": "删除这个送货单？",
  "Comprobar mercancía": "对货",
  "Recibido": "已收",
  "Faltan": "缺",
  "Sobran": "多",
  "Completo": "齐全",
  "Escanea los productos que han llegado": "扫描到货的商品",
  "No está en este albarán": "不在这个送货单中",
  "Importar Excel de Bohao": "导入博皓 Excel",
  "Exporta los productos desde Bohao Market a Excel y súbelo aquí. Cada importación sustituye a la anterior.":
    "从博皓收银系统导出商品 Excel 并上传。每次导入会替换之前的数据。",
  "Columnas detectadas": "识别到的列",
  "Importar": "导入",
  "productos": "个商品",
  "Última importación": "上次导入",
  "Ninguna": "无",
  "Sin código": "无条码",
  "Avisos": "提示",
  "Leído sin IA": "未使用 AI 读取",
  "Nada": "无",
  "Revisar": "检查",
  "Productos importados": "商品已导入",
  "Datos del documento": "单据信息",
  "Último coste": "最近进价",
  "Margen": "利润率",
  "Sin código de barras": "没有条码",
  "Código de barras dudoso": "条码可疑",
  "Falta la cantidad": "缺少数量",
  "Falta el precio": "缺少单价",
  "Cantidad × precio no coincide con el importe": "数量 × 单价 与金额不符",
  "Instalar en el móvil": "安装到手机",
  "Los datos se guardan en este móvil.": "数据保存在这台手机上。",
  "Buscar por código, referencia o nombre": "按条码、货号或名称搜索",
  "Ver albarán": "查看送货单",
  "(sin columna)": "（无）",
  "Con fotos puede tardar hasta un minuto.": "照片识别可能需要一分钟。",
  "Si el albarán tiene varias páginas, elige todas las fotos a la vez.": "如果送货单有多页，请一次选择所有照片。",
  "Leído con IA": "AI 识别",
  "¿No se ha leído bien? Leer con IA": "识别不对？用 AI 识别",
  "La IA puede equivocarse: revisa sobre todo los códigos de barras y los precios.": "AI 可能出错：请重点检查条码和价格。",
  "Para leer fotos con IA, conecta la base de datos en Ajustes. Mientras tanto puedes añadir las líneas a mano.":
    "要用 AI 识别照片，请先在设置中连接数据库。现在可以手动添加。",
  "Este PDF es escaneado (es una imagen). Para leerlo con IA, conecta la base de datos en Ajustes. Mientras tanto puedes añadir las líneas a mano.":
    "这个 PDF 是扫描件（图片）。要用 AI 识别，请先在设置中连接数据库。现在可以手动添加。",
  "Dudoso en la foto": "照片中看不清",
  "Base de datos compartida": "共享数据库",
  "Con ella todos los móviles de la tienda ven los mismos albaranes, y se pueden leer fotos con IA.": "连接后，店里所有手机看到相同的送货单，并可用 AI 识别照片。",
  "Código de tienda": "店铺代码",
  "El código de tienda no es válido.": "店铺代码无效。",
  "O escribe la dirección y la clave de Supabase": "或输入 Supabase 地址和密钥",
  "Conectar": "连接",
  "Faltan la dirección o la clave.": "缺少地址或密钥。",
  "Inicia sesión con la cuenta de la tienda": "用店铺账号登录",
  "Contraseña": "密码",
  "Entrar": "登录",
  "No se pudo iniciar sesión.": "登录失败。",
  "Cambiar de base de datos": "更换数据库",
  "Conectado como": "已登录：",
  "Sincronización": "同步",
  "sincronizando…": "同步中…",
  "error": "错误",
  "Sincronizar ahora": "立即同步",
  "Para conectar otro móvil": "连接另一台手机",
  "Envía este enlace al otro móvil (por WhatsApp, por ejemplo), ábrelo y entra con la misma cuenta.": "把这个链接发到另一台手机（例如微信或 WhatsApp），打开后用同一账号登录。",
  "Compartir enlace de la tienda": "分享店铺链接",
  "Enlace copiado.": "链接已复制。",
  "Cerrar sesión": "退出登录",
  "Conectado a la base de datos compartida": "已连接共享数据库",
  "Los datos se guardan solo en este móvil. Conectar la base de datos compartida →": "数据只保存在这台手机上。连接共享数据库 →",
  "La IA no ha podido leer este documento.": "AI 无法识别这个文件。",
  "El documento es demasiado largo. Súbelo por partes.": "文件太长，请分开上传。",
  "La IA está ocupada. Prueba en un minuto.": "AI 繁忙，请一分钟后再试。",
  "Inicia sesión con la cuenta de la tienda.": "请用店铺账号登录。",
  "PVP sin IVA 21%": "售价不含 21% 增值税",
  "Sin conexión": "没有网络",
  "Email": "邮箱",
  "Clave anon / publishable": "anon / publishable 密钥",
  "Aceptar": "确定",
  "No se pudo abrir la foto (¿formato HEIC?). Prueba a hacerla desde la app.": "无法打开照片（HEIC 格式？），请在本应用里直接拍照。",
  "Respuesta vacía de la IA.": "AI 没有返回内容。",
  "Falta configurar la base de datos.": "还没有设置数据库。",
  "Método no permitido": "不允许的请求方法",
  "Petición no válida.": "请求无效。",
  "Las fotos son demasiado grandes.": "照片太大。",
  "La clave de la IA no es válida (revisa ANTHROPIC_API_KEY).": "AI 密钥无效（请检查 ANTHROPIC_API_KEY）。",
  "Error inesperado al leer el documento.": "读取文件时出现意外错误。",
  "La respuesta de la IA no tiene el formato esperado.": "AI 返回的格式不对。",
  "Demasiadas fotos o ninguna (máximo 10 páginas).": "照片太多或没有照片（最多 10 页）。",
  "La IA rechazó la petición.": "AI 拒绝了请求。",
  "La IA no responde. Prueba más tarde.": "AI 没有响应，请稍后再试。",
  "Para leer fotos con IA, conecta la base de datos en Ajustes.": "要用 AI 识别照片，请先在设置中连接数据库。",
  "Invalid login credentials": "邮箱或密码错误",
};

const KEY = "lang";
let current: Lang = (() => {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "es" || saved === "zh") return saved;
  } catch {
    /* sin almacenamiento */
  }
  return "zh"; // la tienda usa la app en chino; se puede cambiar a español con el botón de arriba
})();
const listeners = new Set<() => void>();

export function setLang(l: Lang) {
  current = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* ignorar */
  }
  document.documentElement.lang = l === "zh" ? "zh-CN" : "es";
  listeners.forEach((f) => f());
}

export function getLang(): Lang {
  return current;
}

export function t(es: string): string {
  return current === "zh" ? (ZH[es] ?? es) : es;
}

export function useLang(): Lang {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}
