<template>
  <v-row justify="center" align="center" class="mt-6">
    <v-col cols="12" sm="8" md="6">
      <v-card
        flat
        rounded="lg"
        :style="`background-color: ${option.secondaryColor}`"
        class="pa-4"
      >
        <v-tabs
          v-model="tab"
          centered
          dark
          hide-slider
          :background-color="`${option.secondaryColor}`"
          active-class="font-weight-bold text-decoration-underline"
        >
          <v-tab
            v-for="(item, index) in Object.values(appConfig)"
            :key="index"
            style="
              text-transform: none;
              letter-spacing: normal;
              font-size: 16px;
            "
            @change="onChangeTab(item)"
            class="rounded-lg"
          >
            {{ item.name }}
          </v-tab>
        </v-tabs>
        <v-tabs-items v-model="tab">
          <v-tab-item
            v-for="(item, index) in Object.values(appConfig)"
            :key="index"
          >
            <time-left
              :item="item"
              :tasks="tasks"
              :inPomodoro="inPomodoro"
              @timer-end="(value) => (onChangeTab(value), (inPomodoro = true))"
              @changeStatus="(value) => (inPomodoro = value)"
            ></time-left>
          </v-tab-item>
        </v-tabs-items>
      </v-card>
      <br />
      <v-card flat color="transparent">
        <v-card-title class="d-flex align-center white--text">
          <b>Tasks</b> <v-spacer />
          <v-progress-circular
            :value="
              tasks.length
                ? (tasks.filter((task) => task.done).length / tasks.length) *
                  100
                : 0
            "
            class="mr-2"
          ></v-progress-circular>
          <v-menu bottom left>
            <template v-slot:activator="{ on, attrs }">
              <v-btn dark icon v-bind="attrs" v-on="on">
                <v-icon>mdi-dots-vertical</v-icon>
              </v-btn>
            </template>
            <v-list>
              <v-list-item @click="clearAllTasks" :disabled="!tasks.length">
                <v-list-item-icon>
                  <v-icon>mdi-trash-can-outline</v-icon>
                </v-list-item-icon>
                <v-list-item-content>
                  <v-list-item-title>Clear all tasks</v-list-item-title>
                </v-list-item-content>
              </v-list-item>
            </v-list>
          </v-menu>
        </v-card-title>
        <v-divider dark />
        <v-card-text class="d-flex flex-column" style="gap: 8px">
          <div v-for="(item, index) in tasks" :key="index">
            <task-item
              @update="updateRecord"
              @delete="deleteRecord"
              :item="item"
            ></task-item>
          </div>
        </v-card-text>
        <v-card-actions>
          <task-input
            v-if="isCreating"
            :task="task"
            :isCreating="true"
            @cancel="isCreating ? (isCreating = false) : null"
            @create="createRecord"
          ></task-input>
          <v-btn v-else block outlined dark large @click="isCreating = true">
            <v-icon left>mdi-plus-circle-outline</v-icon> <b>Add Task</b>
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-col>
  </v-row>
</template>
<script>
import TaskItem from "~/components/TaskItem.vue";
import {
  addRecord,
  updateRecord,
  getRecords,
  deleteRecord,
  deleteCollection,
} from "~/composables/useDatabase";
import appConfig from "~/config/app.js";
export default {
  components: { TaskItem },
  name: "IndexPage",
  inject: ["theme", "setTheme"],
  data() {
    return {
      tab: 0,
      appConfig: appConfig,
      option: {
        name: "Pomodoro",
        periodOfTime: 25 * 60,
        color: "pomodoro",
        secondaryColor: "#c15f5e",
        tabColor: "pomodoroActive",
      },
      task: {
        title: null,
        pomos: 1,
        note: null,
      },
      isCreating: false,
      tasks: [],
      collection: "Tasks",
      inPomodoro: false,
    };
  },
  async mounted() {
    this.tasks = await getRecords(this.collection);
  },
  methods: {
    async createRecord(task) {
      try {
        await addRecord(task);
      } catch (error) {
        console.error(error);
      } finally {
        this.isCreating = false;
        this.tasks = await getRecords(this.collection);
      }
    },
    async updateRecord(task) {
      const docId = task.id;
      try {
        await updateRecord(this.collection, docId, {
          title: task.title,
          pomos: task.pomos,
          note: task.note,
          done: task.done,
        });
      } catch (error) {
        console.error(error);
      }
    },
    async deleteRecord(task) {
      try {
        await deleteRecord(this.collection, task.id);
      } catch (error) {
        console.error(error);
      } finally {
        this.tasks = await getRecords(this.collection);
      }
    },
    async clearAllTasks() {
      try {
        await deleteCollection(this.collection);
      } catch (error) {
        console.error(error);
      } finally {
        this.tasks = await getRecords(this.collection);
      }
    },
    onChangeTab(item) {
      this.tab = item.tab;
      this.option = item;
      this.setTheme(item.color);
      this.inPomodoro = false;
    },
  },
};
</script>
