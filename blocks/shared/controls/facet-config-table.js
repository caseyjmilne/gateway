/**
 * Selected-facets configuration table: drag-and-drop to reorder, plus a
 * "Default" button opening a modal for each facet's Compare operator and
 * Value.
 *
 * Compare and Value used to be their own inline `<select>`/`<input>`
 * columns here -- reasonable for two short controls, but "Equals"/"Not
 * Equals"/etc. plus a free-text value made for a wide row that, combined
 * with the Field column and the handle/remove columns either side, forced
 * horizontal scrolling in the (comparatively narrow) Inspector sidebar.
 * One "Default" button per row, opening a `<Modal>` with both controls
 * given real room, fixes the width without losing anything -- the row
 * itself stays narrow regardless of how long a Compare label or Value
 * gets.
 *
 * Structurally the same as column-config-table.js (drag-and-drop reorder +
 * remove) otherwise -- kept as a separate component rather than a shared
 * one with conditional rendering, since the two tables' per-row controls
 * are different enough (and likely to keep diverging) that sharing would
 * mean more branching than reuse.
 *
 * A Date or Date Time field's own Default modal replaces the generic
 * Compare+Value pair entirely, automatically -- a Before/After/Between
 * Mode picker instead, each date boundary independently either a static
 * date or the dynamic "Today" (resolved fresh server-side on every real
 * request -- see Facet_Query::resolve_dynamic_value()'s own docblock).
 * Requested directly, for an "Events" example: "show events with date
 * after TODAY," "after a specific date," "between two dates." Before/
 * After reuse Facet_Query's own existing `<=`/`>=` operators verbatim (no
 * new PHP query logic at all); Between is the one genuinely new compare
 * value, `'BETWEEN'`, whose own `value` is `{from, to}` rather than a
 * single scalar. See DATE_FIELD_TYPES/DateBoundControl below for the
 * actual UI, and TAXONOMY_COMPARE_OPTIONS above for the precedent this
 * per-column-type branching already established before this feature.
 */

import { useState } from '@wordpress/element';
import { Button, Modal, SelectControl, TextControl } from '@wordpress/components';
import { __, sprintf } from '@wordpress/i18n';
import classnames from '../classnames';
import { FACET_COMPARE_OPTIONS } from './facet-compare-options';

// Term membership is inherently binary -- the rest of FACET_COMPARE_OPTIONS
// (">", "LIKE", ...) has no coherent meaning for a taxonomy facet, and
// Facet_Query::apply_facets() only ever reads one of these two for a
// taxonomy anyway (anything else silently becomes "Equals" server-side).
const TAXONOMY_COMPARE_OPTIONS = FACET_COMPARE_OPTIONS.slice( 0, 2 );

// Column_Registry's own `fieldType` -- the raw Gateway Field_Type::key(),
// not an HTML <input> type -- for the two field types that get the
// Before/After/Between date UI below instead of the generic Compare+Value
// pair, the moment one of them is selected. Same per-column-type branching
// site as TAXONOMY_COMPARE_OPTIONS above, just swapping in a differently
// -shaped control block rather than a shorter option list.
const DATE_FIELD_TYPES = [ 'date', 'datetime' ];

// Before/After need no new compare operator at all -- Facet_Query::
// ALLOWED_COMPARE's own existing '<='/'>=' cover them (always the
// INCLUSIVE operator; see this component's own Mode control below for
// why no strict/inclusive choice is exposed). Between is the one
// genuinely new vocabulary member.
const DATE_MODE_OPTIONS = [
	{ label: __( 'After', 'gateway' ), value: 'after' },
	{ label: __( 'Before', 'gateway' ), value: 'before' },
	{ label: __( 'Between', 'gateway' ), value: 'between' },
];

const TODAY_OR_DATE_OPTIONS = [
	{ label: __( 'Today', 'gateway' ), value: 'today' },
	{ label: __( 'Date', 'gateway' ), value: 'date' },
];

/**
 * @param {string} compare A facet's own stored `compare`.
 * @return {'before'|'after'|'between'} The Mode this compare implies --
 *                                       any legacy operator from before
 *                                       this feature existed (`=`, `!=`,
 *                                       `LIKE`, `NOT LIKE`) falls back to
 *                                       "after," carrying its own stored
 *                                       value over as a static date.
 */
function dateModeFromCompare( compare ) {
	if ( '<' === compare || '<=' === compare ) {
		return 'before';
	}
	if ( 'BETWEEN' === compare ) {
		return 'between';
	}
	return 'after';
}

/**
 * Bridges a native `<input type="datetime-local">`'s own value shape
 * ("YYYY-MM-DDTHH:MM", minute-granular, per the browser's own contract)
 * to/from Facet_Query's own canonical "Y-m-d H:i:s" storage shape --
 * the same bridging RecordForm.jsx already does for this exact field
 * type elsewhere in the app.
 */
function toStoredDatetimeValue( inputValue ) {
	return inputValue ? `${ inputValue.replace( 'T', ' ' ) }:00` : '';
}
function toInputDatetimeValue( storedValue ) {
	// This UI has no seconds-level granularity -- a stored "H:i:s" value's
	// own trailing ":00" is simply dropped for editing purposes.
	return storedValue ? storedValue.replace( ' ', 'T' ).slice( 0, 16 ) : '';
}

/**
 * Whether a facet's own "Default" button should read as pressed (a real
 * value is actually configured) -- a plain `'' !== facet.value` check
 * (this file's own original logic) is correct for every scalar value, but
 * a Between facet's own `value` is `{from, to}`, never `''` -- always
 * truthy under that check even with both bounds left blank. Checked
 * explicitly here so a fresh, unconfigured Between facet still reads as
 * "not pressed," same as every other still-blank facet.
 *
 * @param {Object} facet One facet ({ key, compare, value }).
 * @return {boolean}
 */
function isFacetValueConfigured( facet ) {
	if ( facet.value && 'object' === typeof facet.value ) {
		return Boolean( facet.value.from ) || Boolean( facet.value.to );
	}
	return '' !== facet.value;
}

/**
 * One date boundary's own control: a "Today"/"Date" SelectControl (the
 * exact shape Date_Field_Type's own record-creation Default Value picker
 * already uses -- see that class's own docblock), plus a native date/
 * datetime-local input shown only when "Date" is chosen.
 *
 * Deliberately remounts fresh every time a DIFFERENT facet's modal opens
 * (there's no way to switch `editingKey` without the Modal fully
 * unmounting first -- its own overlay blocks every other row's own
 * "Default" button while open), so `lastStaticValue`'s own initial value
 * (computed once, from whatever this facet's own CURRENT stored value
 * already is) never leaks between facets -- no extra reset effect needed.
 *
 * @param {Object}   props
 * @param {string}   props.label     Field label for this bound ("Value", "From", "To").
 * @param {string}   props.fieldType Column_Registry's own `fieldType` ('date'|'datetime').
 * @param {string}   props.value     This bound's own current stored value ('today' or a real date string).
 * @param {Function} props.onChange  ( nextValue ) => void.
 */
function DateBoundControl( { label, fieldType, value, onChange } ) {
	const isDatetime = 'datetime' === fieldType;
	const isToday = 'today' === value;
	// Remembers whatever real date was last entered, purely so toggling
	// back to "Date" after a trip through "Today" doesn't present a blank
	// input -- local UI convenience only, never itself persisted; the
	// wire format stays exactly {compare, value} either way.
	const [ lastStaticValue, setLastStaticValue ] = useState(
		isToday ? '' : value || ''
	);

	return (
		<div className="gateway-facet-date-bound">
			<SelectControl
				__nextHasNoMarginBottom
				label={ label }
				value={ isToday ? 'today' : 'date' }
				options={ TODAY_OR_DATE_OPTIONS }
				onChange={ ( mode ) =>
					onChange( 'today' === mode ? 'today' : lastStaticValue )
				}
			/>
			{ ! isToday && (
				<input
					type={ isDatetime ? 'datetime-local' : 'date' }
					className="gateway-facet-date-bound__input"
					value={
						isDatetime
							? toInputDatetimeValue( value )
							: value || ''
					}
					onChange={ ( event ) => {
						const nextValue = isDatetime
							? toStoredDatetimeValue( event.target.value )
							: event.target.value;
						setLastStaticValue( nextValue );
						onChange( nextValue );
					} }
				/>
			) }
		</div>
	);
}

/**
 * @param {Object}   props
 * @param {Object[]} props.facets       Selected facets, in order: [{ key, compare, value }].
 * @param {Object}   props.columnsByKey Map of key => column definition ({ key, label, type, fieldType }).
 * @param {Function} props.onChange     ( nextFacets ) => void, for reorder/compare/value changes.
 * @param {Function} props.onRemove     ( key ) => void -- removes a facet from the selection.
 */
export default function FacetConfigTable( {
	facets,
	columnsByKey,
	onChange,
	onRemove,
} ) {
	const [ dragIndex, setDragIndex ] = useState( null );
	const [ overIndex, setOverIndex ] = useState( null );
	// The key of the facet whose Default modal is currently open, if any --
	// a key rather than an index, since it needs to keep pointing at the
	// same facet even if `facets` reorders while the modal is open.
	const [ editingKey, setEditingKey ] = useState( null );

	if ( ! facets.length ) {
		return (
			<p className="gateway-columns-config__empty">
				{ __(
					'Select a field above to filter the grid by.',
					'gateway'
				) }
			</p>
		);
	}

	const moveFacet = ( fromIndex, toIndex ) => {
		if ( fromIndex === toIndex || fromIndex === null || toIndex === null ) {
			return;
		}

		const next = facets.slice();
		const [ moved ] = next.splice( fromIndex, 1 );
		next.splice( toIndex, 0, moved );
		onChange( next );
	};

	const updateFacet = ( key, changes ) => {
		const next = facets.map( ( facet ) =>
			facet.key === key ? { ...facet, ...changes } : facet
		);
		onChange( next );
	};

	const editingFacet = facets.find( ( facet ) => facet.key === editingKey );
	const editingColumn = editingFacet && columnsByKey[ editingFacet.key ];
	const editingCompareOptions =
		editingColumn && 'taxonomy' === editingColumn.type
			? TAXONOMY_COMPARE_OPTIONS
			: FACET_COMPARE_OPTIONS;
	// The Before/After/Between date UI replaces the generic Compare+Value
	// pair entirely, automatically, the moment a Date or Date Time field
	// is selected -- no manual toggle, per a direct request.
	const isDateFacet =
		editingColumn && DATE_FIELD_TYPES.includes( editingColumn.fieldType );
	const dateMode = editingFacet ? dateModeFromCompare( editingFacet.compare ) : 'after';

	const handleDateModeChange = ( mode ) => {
		if ( 'between' === mode ) {
			// Carries over whatever single bound was already set (Before/
			// After) as the new range's own "from" -- better than
			// discarding it outright when a site owner is just exploring
			// Mode options. A fresh facet (no prior date typed) starts
			// both bounds blank.
			const priorValue = editingFacet.value;
			const priorStatic =
				priorValue && 'object' === typeof priorValue
					? ''
					: 'today' === priorValue
					? ''
					: priorValue || '';
			updateFacet( editingFacet.key, {
				compare: 'BETWEEN',
				value: { from: priorStatic, to: '' },
			} );
			return;
		}

		const compare = 'before' === mode ? '<=' : '>=';
		const priorValue = editingFacet.value;
		const value =
			priorValue && 'object' === typeof priorValue
				? priorValue.from || ''
				: priorValue || '';
		updateFacet( editingFacet.key, { compare, value } );
	};

	return (
		<>
			<table className="gateway-columns-config gateway-facets-config">
				<thead>
					<tr>
						<th className="gateway-columns-config__handle-col"></th>
						<th>{ __( 'Field', 'gateway' ) }</th>
						<th>{ __( 'Default', 'gateway' ) }</th>
						<th className="gateway-columns-config__remove-col"></th>
					</tr>
				</thead>
				<tbody>
					{ facets.map( ( facet, index ) => {
						const column = columnsByKey[ facet.key ];

						return (
							<tr
								key={ facet.key }
								className={ classnames(
									'gateway-columns-config__row',
									dragIndex === index && 'is-dragging',
									overIndex === index &&
										dragIndex !== index &&
										'is-drop-target'
								) }
								onDragOver={ ( event ) => {
									event.preventDefault();
									setOverIndex( index );
								} }
								onDrop={ ( event ) => {
									event.preventDefault();
									moveFacet( dragIndex, index );
									setDragIndex( null );
									setOverIndex( null );
								} }
								onDragEnd={ () => {
									setDragIndex( null );
									setOverIndex( null );
								} }
							>
								{ /* draggable lives on the handle, not the row, so a drag can
							   only be started from here -- not from the Default button
							   elsewhere in the row. */ }
								<td
									className="gateway-columns-config__handle"
									aria-hidden="true"
									draggable
									onDragStart={ ( event ) => {
										setDragIndex( index );
										event.dataTransfer.effectAllowed = 'move';
										event.dataTransfer.setData(
											'text/plain',
											String( index )
										);
									} }
								>
									⠿
								</td>
								<td>{ ( column && column.label ) || facet.key }</td>
								<td>
									<Button
										variant="secondary"
										size="small"
										isPressed={ isFacetValueConfigured( facet ) }
										onClick={ () => setEditingKey( facet.key ) }
									>
										{ __( 'Default', 'gateway' ) }
									</Button>
								</td>
								<td>
									<Button
										className="gateway-columns-config__remove"
										icon="no-alt"
										label={ __( 'Remove filter', 'gateway' ) }
										size="small"
										isDestructive
										onClick={ () => onRemove( facet.key ) }
									/>
								</td>
							</tr>
						);
					} ) }
				</tbody>
			</table>
			{ editingFacet && (
				<Modal
					title={ sprintf(
						/* translators: %s: field label. */
						__( 'Default value for “%s”', 'gateway' ),
						( editingColumn && editingColumn.label ) || editingFacet.key
					) }
					onRequestClose={ () => setEditingKey( null ) }
					className="gateway-facet-default-modal"
				>
					{ isDateFacet ? (
						<>
							<SelectControl
								__nextHasNoMarginBottom
								label={ __( 'Mode', 'gateway' ) }
								value={ dateMode }
								options={ DATE_MODE_OPTIONS }
								onChange={ handleDateModeChange }
							/>
							{ 'between' === dateMode ? (
								<>
									<DateBoundControl
										label={ __( 'From', 'gateway' ) }
										fieldType={ editingColumn.fieldType }
										value={
											( editingFacet.value &&
												editingFacet.value.from ) ||
											''
										}
										onChange={ ( from ) =>
											updateFacet( editingFacet.key, {
												value: {
													...editingFacet.value,
													from,
												},
											} )
										}
									/>
									<DateBoundControl
										label={ __( 'To', 'gateway' ) }
										fieldType={ editingColumn.fieldType }
										value={
											( editingFacet.value &&
												editingFacet.value.to ) ||
											''
										}
										onChange={ ( to ) =>
											updateFacet( editingFacet.key, {
												value: {
													...editingFacet.value,
													to,
												},
											} )
										}
									/>
								</>
							) : (
								<DateBoundControl
									label={ __( 'Value', 'gateway' ) }
									fieldType={ editingColumn.fieldType }
									value={ editingFacet.value }
									onChange={ ( value ) =>
										updateFacet( editingFacet.key, { value } )
									}
								/>
							) }
						</>
					) : (
						<>
							<SelectControl
								__nextHasNoMarginBottom
								label={ __( 'Compare', 'gateway' ) }
								value={ editingFacet.compare }
								options={ editingCompareOptions }
								onChange={ ( compare ) =>
									updateFacet( editingFacet.key, { compare } )
								}
							/>
							<TextControl
								__nextHasNoMarginBottom
								label={ __( 'Value', 'gateway' ) }
								value={ editingFacet.value }
								onChange={ ( value ) =>
									updateFacet( editingFacet.key, { value } )
								}
							/>
						</>
					) }
					<Button
						variant="primary"
						onClick={ () => setEditingKey( null ) }
					>
						{ __( 'Done', 'gateway' ) }
					</Button>
				</Modal>
			) }
		</>
	);
}
