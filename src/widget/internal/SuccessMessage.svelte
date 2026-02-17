<script lang="ts">
	interface Props {
		publicId: number;
		onclose: () => void;
	}

	let { publicId, onclose }: Props = $props();
</script>

<div class="beacon-message beacon-message--success">
	<div class="beacon-message-icon">
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
		</svg>
	</div>
	<h3 class="beacon-message-title">Thank you!</h3>
	<p class="beacon-message-text">Feedback submitted as #{publicId}</p>
	<div class="beacon-message-actions">
		<button class="beacon-btn-primary" onclick={onclose}>Done</button>
	</div>
</div>
