import { useState } from "react";

function EmailList({ 
  emails, 
  loading, 
  error, 
  emptyMessage, 
  onEmailClick, 
  hasMore, 
  onLoadMore, 
  isSent,
  isDraft,
  currentView,
  activeCategory,
  onSelectCategory,
  searchQuery,
  onClearSearch,
  onApplyFilter,
  onRefresh
}) {
  const [showFilters, setShowFilters] = useState(false);
  const [filterSender, setFilterSender] = useState("");
  const [filterDate, setFilterDate] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterKeyword, setFilterKeyword] = useState("");

  const handleFilterSubmit = (e) => {
    e.preventDefault();
    const parts = [];
    if (filterSender.trim()) parts.push(`from:${filterSender.trim()}`);
    if (filterDate === "1d") parts.push("newer_than:1d");
    if (filterDate === "7d") parts.push("newer_than:7d");
    if (filterDate === "30d") parts.push("newer_than:30d");
    if (filterStatus === "unread") parts.push("is:unread");
    if (filterStatus === "read") parts.push("is:read");
    if (filterKeyword.trim()) parts.push(filterKeyword.trim());

    const queryStr = parts.join(" ");
    if (queryStr && onApplyFilter) {
      onApplyFilter(queryStr);
    }
  };

  const handleResetFilters = () => {
    setFilterSender("");
    setFilterDate("all");
    setFilterStatus("all");
    setFilterKeyword("");
    if (onClearSearch) onClearSearch();
  };

  return (
    <div className="email-list-container">
      {/* Category Tabs (Shown when in Inbox view) */}
      {currentView === "inbox" && (
        <div className="category-tabs">
          <button 
            className={`category-tab ${activeCategory === "primary" ? "active" : ""}`}
            onClick={() => onSelectCategory("primary")}
          >
            <span className="tab-icon">📥</span> Primary
          </button>
          <button 
            className={`category-tab ${activeCategory === "promotions" ? "active" : ""}`}
            onClick={() => onSelectCategory("promotions")}
          >
            <span className="tab-icon">🏷️</span> Promotions
          </button>
          <button 
            className={`category-tab ${activeCategory === "social" ? "active" : ""}`}
            onClick={() => onSelectCategory("social")}
          >
            <span className="tab-icon">👥</span> Social
          </button>
          <button 
            className={`category-tab ${activeCategory === "updates" ? "active" : ""}`}
            onClick={() => onSelectCategory("updates")}
          >
            <span className="tab-icon">ℹ️</span> Updates
          </button>
        </div>
      )}

      {/* Gmail-Style Email List Toolbar */}
      <div className="list-toolbar">
        <div className="list-toolbar-left">
          <button className="icon-btn" title="Select (Not implemented)">
            <input type="checkbox" disabled style={{ cursor: "pointer" }} />
          </button>
          <button className="icon-btn" onClick={onRefresh} title="Refresh emails">
            ↻
          </button>
          <button 
            className={`filter-toggle-btn ${showFilters ? "active" : ""}`}
            onClick={() => setShowFilters(!showFilters)}
            title="Filter emails"
          >
            🔍 Filters {showFilters ? "▲" : "▼"}
          </button>
        </div>

        <div className="list-toolbar-right">
          <span className="pagination-info">
            {emails.length > 0 ? `1–${emails.length}` : "0"}
          </span>
          <button className="icon-btn" disabled title="Previous page">
            ‹
          </button>
          <button className="icon-btn" onClick={onLoadMore} disabled={!hasMore || loading} title="Next page">
            ›
          </button>
        </div>
      </div>

      {/* UI Filter Drawer */}
      {showFilters && (
        <form className="ui-filter-panel" onSubmit={handleFilterSubmit}>
          <div className="filter-group">
            <label>Sender:</label>
            <input 
              type="text" 
              placeholder="e.g. nishanth" 
              value={filterSender}
              onChange={(e) => setFilterSender(e.target.value)}
            />
          </div>

          <div className="filter-group">
            <label>Date Range:</label>
            <select value={filterDate} onChange={(e) => setFilterDate(e.target.value)}>
              <option value="all">All time</option>
              <option value="1d">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Status:</label>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="all">All</option>
              <option value="unread">Unread</option>
              <option value="read">Read</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Keyword:</label>
            <input 
              type="text" 
              placeholder="e.g. hello, invoice" 
              value={filterKeyword}
              onChange={(e) => setFilterKeyword(e.target.value)}
            />
          </div>

          <div className="filter-actions">
            <button type="submit" className="apply-filter-btn">Apply Filter</button>
            <button type="button" className="reset-filter-btn" onClick={handleResetFilters}>Reset</button>
          </div>
        </form>
      )}

      {/* Search Result Indicator Banner */}
      {currentView === "search" && searchQuery && (
        <div className="search-banner">
          <span>
            Search results for: <strong>"{searchQuery}"</strong> (Showing {emails.length > 0 ? `1–${emails.length}` : "0"} results)
          </span>
          <button className="clear-search-btn" onClick={onClearSearch}>
            ✕ Clear Search / Back to Inbox
          </button>
        </div>
      )}

      {/* Email List Rows */}
      <div className="email-list">
        {loading && emails.length === 0 && (
          <div className="message">
            Loading your emails...
          </div>
        )}

        {error && (
          <div className="error">
            {error}
          </div>
        )}

        {!loading && !error && emails.length === 0 && (
          <div className="message">
            {currentView === "search" 
              ? `No matching emails found for "${searchQuery || ""}".` 
              : (emptyMessage || "No emails found.")}
          </div>
        )}

        {emails.map((email) => (
          <div
            className={`email-row ${email.unread ? "unread" : ""}`}
            key={email.id}
            onClick={() => onEmailClick(email.id)}
          >
            <div className="row-icons">
              <span style={{ cursor: "default", opacity: 0.5 }} title="Select (Not implemented)">⬜</span>
              <span style={{ cursor: "default", opacity: 0.5 }} title="Star (Not implemented)">☆</span>
            </div>
            <div className="email-row-sender" title={isSent ? `To: ${email.to}` : isDraft ? `Draft: ${email.to}` : email.from}>
              {isSent ? `To: ${email.to}` : isDraft ? `Draft to: ${email.to}` : email.from}
            </div>
            <div className="email-row-subject">
              {isDraft && <span className="draft-badge">[Draft] </span>}
              <span className="subject">{email.subject || "(No subject)"}</span>
              <span className="snippet"> - {email.snippet}</span>
            </div>
            <div className="email-row-date">
              {email.date}
            </div>
          </div>
        ))}
        
        {hasMore && (
          <div className="load-more-container" style={{ textAlign: "center", padding: "20px" }}>
            <button 
              style={{ background: "var(--bg-surface-hover)", color: "var(--text-primary)", border: "1px solid var(--border-color)", padding: "10px 20px", borderRadius: "20px", cursor: "pointer", fontWeight: "bold" }}
              onClick={onLoadMore} 
              disabled={loading}
            >
              {loading ? "Loading more..." : "Load More"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default EmailList;
