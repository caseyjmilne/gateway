/**
 * A small rule-builder editor for a field's own Conditional Logic --
 * OR'd groups of AND'd `{field, operator, value}` rules, controlling
 * whether `RecordForm` shows this field at all based on some OTHER
 * field's own current value. Mirrors `ChoicesEditor.jsx`'s own shape --
 * a controlled `value`/`onChange` pair the caller (`FieldEditor`) wires
 * in via a single `<Controller name="conditional_logic.groups" ...>`,
 * this component holding no state of its own -- rather than
 * `react-hook-form`'s own `useFieldArray` (which would need one nested
 * instance per group for a tree this shape), since a plain "rebuild the
 * whole array, call onChange" mutation is simpler here and consistent
 * with how this app already treats every other orderable/editable list.
 *
 * `groups` is `Gateway\\Model_Fields::sanitize_conditional_logic()`'s own
 * `groups` shape: `[{ rules: [{ field, operator, value }, ...] }, ...]`.
 * A blank/incomplete rule (no field picked yet) is tolerated here while
 * editing -- the server is what actually drops one on save, the same
 * "server validates, this is just the editing surface" split `ChoicesEditor`
 * already has for a blank choice.
 *
 * `otherFields` is every OTHER field on this model (`{name, label}`,
 * excluding whichever field is currently being edited -- a field can
 * never meaningfully condition on its own value) -- the same list the
 * server's own `sanitize_conditional_logic()` validates a rule's `field`
 * against, so nothing this editor could ever produce gets silently
 * dropped on save.
 */

const OPERATORS = [
	{ key: 'has_any_value', label: 'Has any value', needsValue: false },
	{ key: 'has_no_value', label: 'Has no value', needsValue: false },
	{ key: 'value_equals', label: 'Value is equal to', needsValue: true },
	{ key: 'value_not_equals', label: 'Value is not equal to', needsValue: true },
	{ key: 'value_contains', label: 'Value contains', needsValue: true },
];

const blankRule = ( otherFields ) => ( {
	field: otherFields[ 0 ]?.name || '',
	operator: 'value_equals',
	value: '',
} );

export default function ConditionalLogicEditor( { groups, onChange, otherFields } ) {
	const updateRule = ( groupIndex, ruleIndex, patch ) => {
		onChange(
			groups.map( ( group, gi ) =>
				gi !== groupIndex
					? group
					: {
							rules: group.rules.map( ( rule, ri ) =>
								ri !== ruleIndex ? rule : { ...rule, ...patch }
							),
					  }
			)
		);
	};

	const addRule = ( groupIndex ) => {
		onChange(
			groups.map( ( group, gi ) =>
				gi !== groupIndex
					? group
					: { rules: [ ...group.rules, blankRule( otherFields ) ] }
			)
		);
	};

	const removeRule = ( groupIndex, ruleIndex ) => {
		// Removing a group's only rule removes the whole group -- there's
		// no meaningful "group with zero rules" state to leave behind.
		onChange(
			groups
				.map( ( group, gi ) =>
					gi !== groupIndex
						? group
						: { rules: group.rules.filter( ( _rule, ri ) => ri !== ruleIndex ) }
				)
				.filter( ( group ) => group.rules.length > 0 )
		);
	};

	const addGroup = () => {
		onChange( [ ...groups, { rules: [ blankRule( otherFields ) ] } ] );
	};

	const removeGroup = ( groupIndex ) => {
		onChange( groups.filter( ( _group, gi ) => gi !== groupIndex ) );
	};

	if ( 0 === otherFields.length ) {
		return (
			<p className="description">
				Add another field to this model first -- there&rsquo;s
				nothing else to base a condition on yet.
			</p>
		);
	}

	return (
		<div className="gateway-conditional-logic">
			<p className="gateway-conditional-logic-label">Show this field if</p>
			{ groups.map( ( group, groupIndex ) => (
				<div key={ groupIndex }>
					{ groupIndex > 0 && (
						<p className="gateway-conditional-logic-or">or</p>
					) }
					<div className="gateway-conditional-logic-group">
						{ group.rules.map( ( rule, ruleIndex ) => {
							const operatorMeta =
								OPERATORS.find( ( op ) => op.key === rule.operator ) ||
								OPERATORS[ 2 ];
							const isLastRule = ruleIndex === group.rules.length - 1;

							return (
								<div
									className="gateway-conditional-logic-rule"
									// eslint-disable-next-line react/no-array-index-key -- rules have no other stable identity; reordering isn't supported here, only add/remove, both handled via onChange above.
									key={ ruleIndex }
								>
									<select
										className="regular-text"
										value={ rule.field }
										onChange={ ( event ) =>
											updateRule( groupIndex, ruleIndex, {
												field: event.target.value,
											} )
										}
									>
										{ otherFields.map( ( field ) => (
											<option key={ field.name } value={ field.name }>
												{ field.label }
											</option>
										) ) }
									</select>
									<select
										className="regular-text"
										value={ rule.operator }
										onChange={ ( event ) =>
											updateRule( groupIndex, ruleIndex, {
												operator: event.target.value,
											} )
										}
									>
										{ OPERATORS.map( ( op ) => (
											<option key={ op.key } value={ op.key }>
												{ op.label }
											</option>
										) ) }
									</select>
									{ operatorMeta.needsValue ? (
										<input
											type="text"
											className="regular-text"
											value={ rule.value }
											onChange={ ( event ) =>
												updateRule( groupIndex, ruleIndex, {
													value: event.target.value,
												} )
											}
										/>
									) : (
										<span className="gateway-conditional-logic-value-placeholder" />
									) }
									{ isLastRule ? (
										<button
											type="button"
											className="gateway-conditional-logic-and"
											onClick={ () => addRule( groupIndex ) }
										>
											and
										</button>
									) : (
										<button
											type="button"
											className="gateway-conditional-logic-remove"
											onClick={ () => removeRule( groupIndex, ruleIndex ) }
											aria-label="Remove rule"
											title="Remove rule"
										>
											×
										</button>
									) }
								</div>
							);
						} ) }
					</div>
					{ groups.length > 1 && (
						<button
							type="button"
							className="gateway-conditional-logic-remove-group"
							onClick={ () => removeGroup( groupIndex ) }
						>
							Remove group
						</button>
					) }
				</div>
			) ) }
			<p>
				<button
					type="button"
					className="button"
					onClick={ addGroup }
				>
					Add rule group
				</button>
			</p>
		</div>
	);
}
