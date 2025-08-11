# Export Dialog Display Issue - Full Page vs Panel Region

## Issue Description

**Problem**: When the "Export" button is clicked, the export dialog currently displays over the entire page instead of being constrained to the export panel region. This creates a poor user experience where the entire editor interface is overlaid with the export dialog.

**Expected Behavior**: The export dialog should only appear within the designated export panel region, allowing users to maintain visibility of the timeline and other editor components while configuring export settings.

## Root Cause Analysis

The export dialog is currently rendered as a global overlay component in the main editor layout, rather than being integrated into a specific panel area. The dialog uses full-screen positioning and is triggered from the header but rendered at the root level.

## Files Requiring Modification

### 1. Main Layout Structure
**File**: `apps/web/src/routes/editor.$project_id.tsx`
- **Lines**: 18 (import), ~140 (render)
- **Change**: Move `<ExportDialog />` from root level to specific panel region
- **Action**: Integrate export dialog into the properties panel or create dedicated export panel

### 2. Export Dialog Component
**File**: `apps/web/src/components/export-dialog.tsx`
- **Lines**: 33-571 (entire component)
- **Changes Needed**:
  - Remove full-screen overlay styling
  - Update component to fit within panel constraints
  - Remove `isDialogOpen` conditional rendering logic
  - Update styling to work within panel dimensions

### 3. Export Store State Management
**File**: `apps/web/src/stores/export-store.ts`
- **Lines**: TBD (contains `isDialogOpen`, `setDialogOpen`)
- **Changes Needed**:
  - Update state management for panel-based display
  - Consider renaming `isDialogOpen` to `isExportPanelActive`
  - Update state transitions for panel-based workflow

### 4. Export Trigger Component
**File**: `apps/web/src/components/editor-header.tsx`
- **Lines**: Contains `setDialogOpen(true)` call
- **Changes Needed**:
  - Update export button behavior to activate panel instead of overlay
  - Consider changing button text/icon to indicate panel activation

### 5. Properties Panel Integration
**File**: `apps/web/src/components/editor/properties-panel/index.tsx`
- **Lines**: 26-onwards (main component structure)
- **Changes Needed**:
  - Add tab/section switching logic for Properties vs Export views
  - Integrate export controls into existing panel layout
  - Handle state management for view switching
  - Maintain existing element properties functionality alongside export features

## Implementation Approach

### Integrate into Properties Panel
1. Add export functionality as a tab/section in the existing Properties Panel
2. Update Properties Panel to handle export state alongside element properties
3. Create seamless switching between property editing and export configuration
4. Add tab/section navigation within Properties Panel for:
   - **Element Properties** (default view when timeline elements are selected)
   - **Export Configuration** (activated when export button is clicked)

## Technical Considerations

### Panel Store Updates
- No changes needed to panel layout or sizing logic
- Export state managed through existing properties panel space
- Maintain current panel normalization and resizing behavior

### Responsive Design
- Ensure export controls work within panel width constraints
- Consider mobile/tablet layout implications
- Maintain accessibility standards within confined space

### State Management
- Update export store to work with Properties Panel integration
- Replace `isDialogOpen` with panel view state management
- Handle export progress display within existing panel constraints
- Manage export validation and error states within Properties Panel layout
- Coordinate between element selection state and export configuration state

## Files to Monitor for Side Effects

- `apps/web/src/hooks/use-export-*.ts` - Export-related hooks may need updates for panel integration
- `apps/web/src/components/export-canvas.tsx` - Canvas integration and positioning within panel
- `apps/web/src/stores/timeline-store.ts` - Element selection state coordination
- Properties Panel sub-components that may be affected by layout changes

## Success Criteria

1. Export controls appear only within Properties Panel region (no full-page overlay)
2. Editor timeline and other components remain visible during export configuration
3. Smooth transition between element properties view and export configuration view
4. Export functionality maintains all current features within panel constraints
5. Properties Panel layout remains stable and properly sized
6. Export progress is clearly visible within existing panel space
7. Users can switch back to element properties while export is in progress
8. Mobile/responsive behavior is maintained for both properties and export views

## Priority: High
This issue directly affects user experience and editor workflow efficiency.