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
  "Volver": "返回",
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
  "Nada": "无",
  "Revisar": "检查",
  "Productos importados": "商品已导入",
  "Datos del documento": "单据信息",
  "Último coste": "最近进价",
  "Margen": "利润率",
  "Sin código de barras": "没有条码",
  "Revisa si es un producto: si no lo es, quítala con ✕": "请确认是否为商品，不是请点 ✕ 删除",
  "Código de barras dudoso": "条码可疑",
  "Falta la cantidad": "缺少数量",
  "Falta el precio": "缺少单价",
  "Cantidad × precio no coincide con el importe": "数量 × 单价 与金额不符",
  "Instalar en el móvil": "安装到手机",
  "Los datos se guardan en este móvil.": "数据保存在这台手机上。",
  "Buscar por código, referencia o nombre": "按条码、货号或名称搜索",
  "Ver albarán": "查看送货单",
  "(sin columna)": "（无）",
  "Base de datos compartida": "共享数据库",
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
  "Precios con IVA": "含税价格",
  "Último coste con IVA": "最近进价（含税）",
  "PVP con IVA": "售价（含税）",
  "Coste sin IVA": "进价（不含税）",
  "PVP sin IVA": "售价（不含税）",
  "con IVA": "含税",
  "El importe calculado no coincide con el importe final del documento": "按单价计算的金额与单据最终金额不符",
  "Importe final del documento": "单据最终金额",
  "Calculado con los precios": "按单价计算",
  "con IVA 21%": "加 21% 增值税",
  "Diferencia": "差额",
  "La suma de las líneas cuadra con la base": "各行合计与税前金额相符",
  "importe final": "最终金额",
  "Cuadra con el importe final": "与最终金额相符",
  "los precios ya llevan IVA": "价格已含税",
  "precios sin IVA + IVA 21%": "单价不含税，加 21% 增值税",
  "precios sin IVA + IVA 21% + recargo de equivalencia 5,2%": "单价不含税，加 21% 增值税 + 5,2% 等价附加税",
  "Total con IVA": "含税合计",
  "Precio unitario con IVA": "含税单价",
  "PVP sin IVA 21%": "售价不含 21% 增值税",
  "Sin conexión": "没有网络",
  "Email": "邮箱",
  "Clave anon / publishable": "anon / publishable 密钥",
  "Aceptar": "确定",
  "Falta configurar la base de datos.": "还没有设置数据库。",
  "Invalid login credentials": "邮箱或密码错误",
  "Cambiar lente": "切换镜头",
  "Toca la imagen para enfocar": "点击画面对焦",
  "No se puede leer automáticamente (foto o PDF escaneado). Añade las líneas a mano.": "无法自动读取（照片或扫描的 PDF），请手动添加。",
  "Con ella todos los móviles de la tienda ven los mismos albaranes.": "连接后，店里所有手机看到相同的送货单。",
  "Cantidad en el albarán": "送货单数量",
  "¿Cuántas han llegado?": "到了多少？",
  "Quitar la marca de comprobado": "取消对货标记",
  "Comprobado": "已对",
  "Escanea un producto o toca una línea": "扫描商品或点击一行",
  "Editar": "编辑",
  "Editar albarán": "编辑送货单",
  "La suma de las líneas cuadra con el documento": "各行合计与单据总额相符",
  "Filas sin código de barras descartadas (revísalas en el documento)": "已忽略没有条码的行（请对照原单据检查）",

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
