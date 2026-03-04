/**
 * Шапка печатного документа: название страницы, подзаголовок, дата печати
 * Рендерится в DOM, видна только при печати. Контент заполняется из PrintContext.
 */
export default function PrintDocHeader() {
  return (
    <div id="print-doc-header" className="print-only" aria-hidden="true">
      <div>
        <h1 id="print-title-text" className="print-title" />
        <p id="print-subtitle-text" className="print-subtitle" />
      </div>
      <span id="print-date" className="print-date" />
    </div>
  );
}
