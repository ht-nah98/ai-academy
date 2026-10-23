// npm start — chạy API thật ở cổng 3110 với store bộ nhớ có sẵn dữ liệu mẫu. File này có sẵn.
import { createApp } from './app.ts';
import { createMemoryStore } from './store.ts';

const store = createMemoryStore();
const general = await store.createChannel('general');
await store.createChannel('dev');
if (general !== null) {
  for (const [author, text] of [['An', 'Chào cả nhà'], ['Binh', 'Deploy lúc 10h nhé'], ['An', 'Ok, mình trực']]) {
    await store.addMessage({ channelId: general.id, author: author!, text: text! });
  }
}

const port = Number(process.env.PORT) || 3110;
createApp(store).listen(port, '127.0.0.1', () => {
  console.log(`TeamPulse API: http://127.0.0.1:${port}/channels`);
  console.log(`Thử: curl -i http://127.0.0.1:${port}/channels/1/messages?limit=2`);
});
