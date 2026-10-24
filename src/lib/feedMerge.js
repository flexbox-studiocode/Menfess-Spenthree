const isOlder = (item, boundary) => {
  const difference = new Date(item.created_at || item.published_at).getTime() - new Date(boundary.created_at || boundary.published_at).getTime();
  return difference < 0 || (difference === 0 && item.public_id < boundary.public_id);
};

// A complete first page is authoritative only down to its oldest tuple.
// Rows below that boundary belong to older pages, not to this refresh.
export function mergeFirstPage(previous, incoming, nextCursor, holdNew = false) {
  const byId = new Map(incoming.map(item => [item.public_id, item]));
  const boundary = incoming.at(-1);
  const retained = previous.filter(item => byId.has(item.public_id) || (nextCursor && boundary && isOlder(item, boundary)));
  const existingIds = new Set(previous.map(item => item.public_id));
  const pending = holdNew ? incoming.filter(item => !existingIds.has(item.public_id)) : [];
  const items = holdNew
    ? retained.map(item => byId.get(item.public_id) || item)
    : [...incoming, ...retained.filter(item => !byId.has(item.public_id))];
  return { items, pending };
}
