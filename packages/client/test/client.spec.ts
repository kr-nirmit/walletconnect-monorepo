import { ERROR, calcExpiry } from "@walletconnect/utils";
import "mocha";
import Client from "../src";
import {
  expect,
  initTwoClients,
  testConnectMethod,
  TEST_CLIENT_DATABASE,
  TEST_CLIENT_OPTIONS,
  deleteClients,
} from "./shared";
import { FIVE_MINUTES } from "@walletconnect/time";

describe("Client Integration", () => {
  it("init", async () => {
    const client = await Client.init(TEST_CLIENT_OPTIONS);
    expect(client).to.be.exist;
  });

  describe("connect", () => {
    it("connect (with new pairing)", async () => {
      const clients = await initTwoClients();
      await testConnectMethod(clients);
      deleteClients(clients);
    });
    it("connect (with old pairing)", async () => {
      const clients = await initTwoClients();
      await testConnectMethod(clients);
      const { A, B } = clients;
      expect(A.pairing.keys).to.eql(B.pairing.keys);
      const { topic: pairingTopic } = A.pairing.get(A.pairing.keys[0]);
      await testConnectMethod(clients, {
        pairingTopic,
      });
      deleteClients(clients);
    });
  });

  describe("disconnect", () => {
    describe("pairing", () => {
      it("deletes the pairing on disconnect", async () => {
        const clients = await initTwoClients();
        const {
          pairingA: { topic },
        } = await testConnectMethod(clients);
        const reason = ERROR.USER_DISCONNECTED.format();
        await clients.A.disconnect({ topic, reason });
        expect(() => clients.A.pairing.get(topic)).to.throw(
          `No matching pairing with topic: ${topic}`,
        );
        const promise = clients.A.ping({ topic });
        await expect(promise).to.eventually.be.rejectedWith(
          `No matching pairing or session with topic: ${topic}`,
        );
        deleteClients(clients);
      });
    });
    describe("session", () => {
      it("deletes the session on disconnect", async () => {
        const clients = await initTwoClients();
        const {
          sessionA: { topic },
        } = await testConnectMethod(clients);
        const reason = ERROR.USER_DISCONNECTED.format();
        await clients.A.disconnect({ topic, reason });
        expect(() => clients.A.session.get(topic)).to.throw(
          `No matching session with topic: ${topic}`,
        );
        const promise = clients.A.ping({ topic });
        await expect(promise).to.eventually.be.rejectedWith(
          `No matching pairing or session with topic: ${topic}`,
        );
        deleteClients(clients);
      });
    });
  });

  describe("ping", () => {
    it("throws if the topic is not a known pairing or session topic", async () => {
      const clients = await initTwoClients();
      const fakeTopic = "nonsense";
      await expect(clients.A.ping({ topic: fakeTopic })).to.eventually.be.rejectedWith(
        `No matching pairing or session with topic: ${fakeTopic}`,
      );
      deleteClients(clients);
    });
    describe("pairing", () => {
      it("A pings B with existing pairing", async () => {
        const clients = await initTwoClients();
        const {
          pairingA: { topic },
        } = await testConnectMethod(clients);
        await clients.A.ping({ topic });
        deleteClients(clients);
      });
      it("B pings A with existing pairing", async () => {
        const clients = await initTwoClients();
        const {
          pairingA: { topic },
        } = await testConnectMethod(clients);
        await clients.B.ping({ topic });
        deleteClients(clients);
      });
      it("clients can ping each other after restart", async () => {
        const beforeClients = await initTwoClients({
          storageOptions: { database: TEST_CLIENT_DATABASE },
        });
        const {
          pairingA: { topic },
        } = await testConnectMethod(beforeClients);
        // ping
        await beforeClients.A.ping({ topic });
        await beforeClients.B.ping({ topic });
        // delete
        deleteClients(beforeClients);
        // restart
        const afterClients = await initTwoClients({
          storageOptions: { database: TEST_CLIENT_DATABASE },
        });
        // ping
        await afterClients.A.ping({ topic });
        await afterClients.B.ping({ topic });
        deleteClients(afterClients);
      });
    });
    describe("session", () => {
      it("A pings B with existing session", async () => {
        const clients = await initTwoClients();
        const {
          sessionA: { topic },
        } = await testConnectMethod(clients);
        await clients.A.ping({ topic });
        deleteClients(clients);
      });
      it("B pings A with existing session", async () => {
        const clients = await initTwoClients();
        const {
          sessionA: { topic },
        } = await testConnectMethod(clients);
        await clients.B.ping({ topic });
        deleteClients(clients);
      });
      it("clients can ping each other after restart", async () => {
        const beforeClients = await initTwoClients({
          storageOptions: { database: TEST_CLIENT_DATABASE },
        });
        const {
          sessionA: { topic },
        } = await testConnectMethod(beforeClients);
        // ping
        await beforeClients.A.ping({ topic });
        await beforeClients.B.ping({ topic });
        // delete
        deleteClients(beforeClients);
        // restart
        const afterClients = await initTwoClients({
          storageOptions: { database: TEST_CLIENT_DATABASE },
        });
        // ping
        await afterClients.A.ping({ topic });
        await afterClients.B.ping({ topic });
        deleteClients(afterClients);
      });
    });
  });

  describe("updateAccounts", () => {
    it("updates session account state with provided accounts", async () => {
      const clients = await initTwoClients();
      const {
        sessionA: { topic },
      } = await testConnectMethod(clients);
      const accountsBefore = clients.A.session.get(topic).accounts;
      const accountsAfter = [
        ...accountsBefore,
        "eip155:43114:0x3c582121909DE92Dc89A36898633C1aE4790382b",
      ];
      await clients.A.updateAccounts({
        topic,
        accounts: accountsAfter,
      });
      const result = clients.A.session.get(topic).accounts;
      expect(result).to.eql(accountsAfter);
      deleteClients(clients);
    });
  });

  describe("updateNamespaces", () => {
    it("updates session namespaces state with provided namespaces", async () => {
      const clients = await initTwoClients();
      const {
        sessionA: { topic },
      } = await testConnectMethod(clients);
      const namespacesBefore = clients.A.session.get(topic).namespaces;
      const namespacesAfter = [
        ...namespacesBefore,
        { chains: ["eip155:12"], methods: ["eth_sendTransaction"], events: ["accountsChanged"] },
      ];
      await clients.A.updateNamespaces({
        topic,
        namespaces: namespacesAfter,
      });
      const result = clients.A.session.get(topic).namespaces;
      expect(result).to.eql(namespacesAfter);
      deleteClients(clients);
    });
  });

  describe("updateExpiry", () => {
    it("updates session expiry state with provided expiry", async () => {
      const clients = await initTwoClients();
      const {
        sessionA: { topic },
      } = await testConnectMethod(clients);
      const expiryAfter = calcExpiry(FIVE_MINUTES);
      await clients.A.updateExpiry({
        topic,
        expiry: expiryAfter,
      });
      const result = clients.A.session.get(topic).expiry;
      expect(result).to.eql(expiryAfter);
      deleteClients(clients);
    });
  });
});
