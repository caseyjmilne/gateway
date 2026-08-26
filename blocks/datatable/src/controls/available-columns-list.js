/**
 * Clickable list of every column available for the selected post type.
 *
 * Per spec: no checkboxes/radios -- clicking a column's name toggles it
 * in/out of the block's `columns` attribute, with the selected state shown
 * purely via styling on the name itself.
 */

import { __ } from '@wordpress/i18n';
import classnames from '../utils/classnames';

/**
 * @param {Object}   props
 * @param {Object[]} props.columns       Available columns: [{ key, label, type }].
 * @param {string[]} props.selectedKeys  Keys currently selected.
 * @param {Function} props.onToggle      ( key ) => void -- called when a name is clicked.
 */
export default function AvailableColumnsList( { columns, selectedKeys, onToggle } ) {
	// Featured Image (`'thumbnail'`) groups with the "Fields" list here,
	// alongside Title/Status/Date/etc -- it reads as a normal post-level
	// field to a site owner picking columns, even though its own `type`
	// is deliberately distinct from `'core'` for cell-rendering purposes
	// (see Column_Registry::get_thumbnail_column()).
	const core = columns.filter(
		( column ) => 'core' === column.type || 'thumbnail' === column.type
	);
	const taxonomy = columns.filter( ( column ) => 'taxonomy' === column.type );
	const meta = columns.filter( ( column ) => 'meta' === column.type );

	return (
		<div className="gateway-columns-available">
			<ColumnGroup
				title={ __( 'Fields', 'gateway' ) }
				columns={ core }
				selectedKeys={ selectedKeys }
				onToggle={ onToggle }
			/>
			<ColumnGroup
				title={ __( 'Taxonomies', 'gateway' ) }
				columns={ taxonomy }
				selectedKeys={ selectedKeys }
				onToggle={ onToggle }
			/>
			<ColumnGroup
				title={ __( 'Custom Fields', 'gateway' ) }
				columns={ meta }
				selectedKeys={ selectedKeys }
				onToggle={ onToggle }
			/>
		</div>
	);
}

function ColumnGroup( { title, columns, selectedKeys, onToggle } ) {
	if ( ! columns.length ) {
		return null;
	}

	return (
		<div className="gateway-columns-available__group">
			<p className="gateway-columns-available__group-title">{ title }</p>
			<ul className="gateway-columns-available__list">
				{ columns.map( ( column ) => {
					const isSelected = selectedKeys.includes( column.key );

					return (
						<li key={ column.key }>
							<button
								type="button"
								className={ classnames(
									'gateway-columns-available__item',
									isSelected && 'is-selected'
								) }
								aria-pressed={ isSelected }
								onClick={ () => onToggle( column.key ) }
							>
								{ column.label }
							</button>
						</li>
					);
				} ) }
			</ul>
		</div>
	);
}
