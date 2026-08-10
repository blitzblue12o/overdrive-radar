import { describe, expect, it } from "vitest";
import {
  clusterCanExpandSpatially,
  clusterLeavesAreColocated,
  clusterPickerHeading,
  leafEventFromFeature,
  resolveClusterClickAction,
  shouldClearClusterPicker,
} from "@/lib/map/cluster-interaction";

describe("cluster interaction", () => {
  it("individual marker path is separate from cluster expand/pick", () => {
    // Cluster action never yields a single event id — only expand or pick.
    expect(
      resolveClusterClickAction({ currentZoom: 10, expansionZoom: 12 })
    ).toBe("expand");
    expect(
      resolveClusterClickAction({ currentZoom: 14, expansionZoom: 14 })
    ).toBe("pick");
    expect(
      resolveClusterClickAction({ currentZoom: 14.2, expansionZoom: 14 })
    ).toBe("pick");
  });

  it("expandable cluster requests further zoom", () => {
    expect(clusterCanExpandSpatially(9, 12)).toBe(true);
    expect(
      resolveClusterClickAction({ currentZoom: 9, expansionZoom: 12 })
    ).toBe("expand");
  });

  it("same-coordinate cluster exposes all leaves in picker heading", () => {
    const leaves = [
      {
        venue_name: "Community Park - Sycamore Hall - 13094 Civic Center Drive",
        address: null,
      },
      {
        venue_name: "Community Park - Sycamore Hall - 13094 Civic Center Drive",
        address: null,
      },
      {
        venue_name: "Community Park - Sycamore Hall - 13094 Civic Center Drive",
        address: null,
      },
    ];
    expect(clusterPickerHeading(leaves, 6)).toBe(
      "6 events at Community Park"
    );
    expect(
      clusterPickerHeading(
        [
          { venue_name: "Oak Hall", address: null },
          { venue_name: "Sycamore Hall", address: null },
        ],
        2
      )
    ).toBe("2 events at this location");
  });

  it("colocated leaf coordinates are detected", () => {
    const park: [number, number] = [-117.047867, 32.953654];
    expect(
      clusterLeavesAreColocated([park, park, [-117.047867, 32.953654]])
    ).toBe(true);
    expect(
      clusterLeavesAreColocated([park, [-117.1, 33.0]])
    ).toBe(false);
  });

  it("leaf parser ignores cluster features and keeps distinct occurrence ids", () => {
    expect(
      leafEventFromFeature({
        properties: { cluster: true, cluster_id: 1, point_count: 6 },
      })
    ).toBeNull();

    const a = leafEventFromFeature({
      properties: {
        id: "occ-a",
        title: "Feeling Fit",
        starts_at: "2026-08-10T17:00:00.000Z",
        ends_at: "2026-08-10T18:00:00.000Z",
        timezone: "America/Los_Angeles",
        venue_name: "Community Park",
        address: null,
      },
    });
    const b = leafEventFromFeature({
      properties: {
        id: "occ-b",
        title: "Feeling Fit",
        starts_at: "2026-08-17T17:00:00.000Z",
        ends_at: "2026-08-17T18:00:00.000Z",
        timezone: "America/Los_Angeles",
        venue_name: "Community Park",
        address: null,
      },
    });
    expect(a?.id).toBe("occ-a");
    expect(b?.id).toBe("occ-b");
    expect(a?.id).not.toBe(b?.id);
  });

  it("clears picker when filter/results drop leaf ids", () => {
    expect(
      shouldClearClusterPicker(["a", "b", "c"], ["a", "b", "c", "d"])
    ).toBe(false);
    expect(shouldClearClusterPicker(["a", "b", "c"], ["a", "b"])).toBe(true);
  });

  it("list-style direct selection is modeled as not requiring cluster picker", () => {
    // Documented contract: opening a known id does not depend on cluster state.
    const selectedFromList = "occ-a";
    const pickerIds = ["occ-a", "occ-b", "occ-c"];
    expect(pickerIds.includes(selectedFromList)).toBe(true);
    // Selecting from the list should clear picker (shell behavior); helper only
    // validates result-set membership for stale cleanup.
    expect(shouldClearClusterPicker(pickerIds, [selectedFromList])).toBe(true);
  });
});
