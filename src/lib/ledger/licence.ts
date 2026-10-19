// Row grouping is an AG Grid Enterprise feature. With a licence key the ledger uses Enterprise
// (rows group by class with subtotals); without one, the free Community edition, where
// "group by" sorts instead. Judges running it locally without a key still get a full grid.
export const AG_GRID_LICENCE = process.env.NEXT_PUBLIC_AG_GRID_LICENSE_KEY;

// v3 keys carry a product type: only Grid (01) or Grid + Charts (0102) unlock the grid. Anything else
// (an AG Studio key, say) would just put a watermark on the ledger, so stay on Community instead.
const type = AG_GRID_LICENCE?.match(/\[v3\]_\[(\w+)\]/)?.[1];
export const CAN_GROUP = Boolean(AG_GRID_LICENCE) && (type === undefined || type === "01" || type === "0102");
