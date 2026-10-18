<script setup lang="ts">
const { state, settle } = useConfirm();
const open = computed({
  get: () => state.value.open,
  set: (value: boolean) => {
    if (!value) settle(false);
  },
});
</script>

<template>
  <UModal v-model:open="open" :title="state.title" :description="state.description">
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="settle(false)">{{ state.cancelLabel ?? "Hủy" }}</UButton>
        <UButton :color="state.color ?? 'primary'" :icon="state.icon" @click="settle(true)">
          {{ state.confirmLabel ?? "Đồng ý" }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
