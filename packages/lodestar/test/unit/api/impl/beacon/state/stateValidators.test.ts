import {config} from "@chainsafe/lodestar-config/lib/presets/minimal";
import {expect, use} from "chai";
import chaiAsPromised from "chai-as-promised";
import sinon, {SinonStubbedInstance, SinonStubbedMember} from "sinon";
import {BeaconStateApi} from "../../../../../../src/api/impl/beacon/state";
import * as stateApiUtils from "../../../../../../src/api/impl/beacon/state/utils";
import {ValidatorStatus} from "../../../../../../src/api/types/validator";
import {BeaconChain} from "../../../../../../src/chain/chain";
import {IBeaconChain} from "../../../../../../src/chain/interface";
import {generateState} from "../../../../../utils/state";
import {StubbedBeaconDb} from "../../../../../utils/stub/beaconDb";
import {generateValidator, generateValidators} from "../../../../../utils/validator";
import {List} from "@chainsafe/ssz";
import {Gwei} from "@chainsafe/lodestar-types";

use(chaiAsPromised);

describe("beacon api impl - state - validators", function () {
  let db: StubbedBeaconDb;
  let chain: SinonStubbedInstance<IBeaconChain>;
  let resolveStateIdStub: SinonStubbedMember<typeof stateApiUtils["resolveStateId"]>;
  let toValidatorResponseStub: SinonStubbedMember<typeof stateApiUtils["toValidatorResponse"]>;
  let validatorPubkeyToIndexStub: SinonStubbedMember<typeof stateApiUtils["validatorPubkeyToIndex"]>;

  const sandbox = sinon.createSandbox();

  beforeEach(function () {
    db = new StubbedBeaconDb(sandbox);
    chain = sandbox.createStubInstance(BeaconChain);
    resolveStateIdStub = sandbox.stub(stateApiUtils, "resolveStateId");
    toValidatorResponseStub = sandbox.stub(stateApiUtils, "toValidatorResponse");
    validatorPubkeyToIndexStub = sandbox.stub(stateApiUtils, "validatorPubkeyToIndex");
    toValidatorResponseStub.returns({
      index: 1,
      pubkey: Buffer.alloc(32, 1),
      status: ValidatorStatus.ACTIVE,
      validator: generateValidator(),
    });
  });

  afterEach(function () {
    sandbox.restore();
  });

  describe("get validators", function () {
    it("state not found", async function () {
      resolveStateIdStub.resolves(null);
      const api = new BeaconStateApi({}, {config, db, chain});
      await expect(api.getStateValidators("notfound")).to.be.rejectedWith("State not found");
    });

    it.skip("indices filter", async function () {
      resolveStateIdStub.resolves({
        state: generateState({validators: generateValidators(10)}),
      });
      const api = new BeaconStateApi({}, {config, db, chain});
      const validators = api.getStateValidators("someState", {indices: [0, 1, 123]});
      expect((await validators).length).to.equal(2);
    });

    it.skip("status filter", async function () {
      resolveStateIdStub.resolves({
        state: generateState({validators: generateValidators(10)}),
      });
      toValidatorResponseStub.onFirstCall().returns({
        index: 1,
        pubkey: Buffer.alloc(32, 1),
        status: ValidatorStatus.WITHDRAWABLE_SLASHED,
        validator: generateValidator(),
      });
      const api = new BeaconStateApi({}, {config, db, chain});
      const validators = api.getStateValidators("someState", {statuses: [ValidatorStatus.ACTIVE]});
      expect((await validators).length).to.equal(9);
    });

    it("success", async function () {
      resolveStateIdStub.resolves({
        state: generateState({validators: generateValidators(10)}),
      });
      const api = new BeaconStateApi({}, {config, db, chain});
      const validators = api.getStateValidators("someState");
      expect((await validators).length).to.equal(10);
    });
  });

  describe("get validator", function () {
    it("state not found", async function () {
      resolveStateIdStub.resolves(null);
      const api = new BeaconStateApi({}, {config, db, chain});
      await expect(api.getStateValidator("notfound", 1)).to.be.rejectedWith("State not found");
    });
    it("validator by index not found", async function () {
      resolveStateIdStub.resolves({
        state: generateState({validators: generateValidators(10)}),
      });
      const api = new BeaconStateApi({}, {config, db, chain});
      await expect(api.getStateValidator("someState", 15)).to.be.rejectedWith("Validator not found");
    });
    it("validator by index found", async function () {
      resolveStateIdStub.resolves({
        state: generateState({validators: generateValidators(10)}),
      });
      const api = new BeaconStateApi({}, {config, db, chain});
      expect(await api.getStateValidator("someState", 1)).to.not.be.null;
    });
    it("validator by root not found", async function () {
      resolveStateIdStub.resolves({
        state: generateState({validators: generateValidators(10)}),
      });
      validatorPubkeyToIndexStub.returns(null);
      const api = new BeaconStateApi({}, {config, db, chain});
      await expect(api.getStateValidator("someState", Buffer.alloc(32, 1))).to.be.rejectedWith("Validator not found");
    });
    it("validator by root found", async function () {
      resolveStateIdStub.resolves({
        state: generateState({validators: generateValidators(10)}),
      });
      validatorPubkeyToIndexStub.returns(2);
      const api = new BeaconStateApi({}, {config, db, chain});
      expect(await api.getStateValidator("someState", Buffer.alloc(32, 1))).to.not.be.null;
    });
  });

  describe("get validators balances", function () {
    it("state not found", async function () {
      resolveStateIdStub.resolves(null);
      const api = new BeaconStateApi({}, {config, db, chain});
      await expect(api.getStateValidatorBalances("notfound")).to.be.rejectedWith("State not found");
    });

    it("indices filters", async function () {
      resolveStateIdStub.resolves({
        state: generateState({
          validators: generateValidators(10),
          balances: Array.from({length: 10}, () => BigInt(10)) as List<Gwei>,
        }),
      });
      validatorPubkeyToIndexStub.withArgs(sinon.match.any, sinon.match.any, Buffer.alloc(32, 1)).returns(3);
      validatorPubkeyToIndexStub.withArgs(sinon.match.any, sinon.match.any, Buffer.alloc(32, 2)).returns(25);
      const api = new BeaconStateApi({}, {config, db, chain});
      const balances = await api.getStateValidatorBalances("somestate", [
        1,
        24,
        Buffer.alloc(32, 1),
        Buffer.alloc(32, 2),
      ]);
      expect(balances.length).to.equal(2);
      expect(balances[0].index).to.equal(1);
      expect(balances[1].index).to.equal(3);
    });

    it("no filters", async function () {
      resolveStateIdStub.resolves({
        state: generateState({
          validators: generateValidators(10),
          balances: Array.from({length: 10}, () => BigInt(10)) as List<Gwei>,
        }),
      });
      const api = new BeaconStateApi({}, {config, db, chain});
      const balances = await api.getStateValidatorBalances("somestate");
      expect(balances.length).to.equal(10);
      expect(balances[0].index).to.equal(0);
      expect(balances[0].balance.toString()).to.equal("10");
    });
  });
});
