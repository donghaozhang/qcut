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
  - Add export panel integration or tab switching logic
  - Create space for export controls within properties panel
  - Handle panel state management

## Implementation Approach

### Option 1: Integrate into Properties Panel (Recommended)
1. Add export functionality as a tab/section in the existing Properties Panel
2. Update Properties Panel to handle export state alongside element properties
3. Create seamless switching between property editing and export configuration

### Option 2: Create Dedicated Export Panel
1. Create new resizable panel in the editor layout
2. Add panel visibility controls to the panel store
3. Position export panel adjacent to properties panel

### Option 3: Replace Properties Panel When Exporting
1. Transform Properties Panel into Export Panel when export is triggered
2. Add back/cancel functionality to return to properties view
3. Maintain panel dimensions and positioning

## Technical Considerations

### Panel Store Updates
- Add export panel state to `usePanelStore` if creating new panel
- Update panel normalization logic if layout changes
- Handle panel visibility and sizing constraints

### Responsive Design
- Ensure export controls work within panel width constraints
- Consider mobile/tablet layout implications
- Maintain accessibility standards within confined space

### State Management
- Update export store to work with panel-based approach
- Handle export progress display within panel constraints
- Manage export validation and error states in smaller space

## Files to Monitor for Side Effects

- `apps/web/src/stores/panel-store.ts` - Panel layout and sizing
- `apps/web/src/components/ui/resizable.tsx` - Resizable panel behavior  
- `apps/web/src/hooks/use-export-*.ts` - Export-related hooks
- `apps/web/src/components/export-canvas.tsx` - Canvas integration

## Success Criteria

1. Export dialog appears only within designated panel region
2. Editor timeline and other components remain visible during export configuration
3. Export functionality maintains all current features
4. Panel layout remains stable and properly sized
5. Export progress is clearly visible within panel constraints
6. Mobile/responsive behavior is maintained

## Priority: High
This issue directly affects user experience and editor workflow efficiency.