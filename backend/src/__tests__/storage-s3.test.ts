import { S3Client } from "@aws-sdk/client-s3";
import { config } from "../config";
import { getStorageDriver, resetStorageDriverForTests } from "../services/storage";

describe("S3-compatible storage driver", () => {
  const originalUpload = {
    driver: config.upload.driver,
    publicBaseUrl: config.upload.publicBaseUrl,
    signedUrlExpiresSeconds: config.upload.signedUrlExpiresSeconds,
    s3: { ...config.upload.s3 },
  };

  beforeEach(() => {
    config.upload.driver = "s3";
    config.upload.publicBaseUrl = "https://media.balican.test";
    config.upload.signedUrlExpiresSeconds = 90;
    config.upload.s3.bucket = "balican-test";
    config.upload.s3.region = "us-east-1";
    config.upload.s3.endpoint = "https://objects.example.test";
    config.upload.s3.forcePathStyle = true;
    config.upload.s3.accessKeyId = "test-access";
    config.upload.s3.secretAccessKey = "test-secret";
    resetStorageDriverForTests();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    config.upload.driver = originalUpload.driver;
    config.upload.publicBaseUrl = originalUpload.publicBaseUrl;
    config.upload.signedUrlExpiresSeconds = originalUpload.signedUrlExpiresSeconds;
    Object.assign(config.upload.s3, originalUpload.s3);
    resetStorageDriverForTests();
  });

  test("stores public and private objects in separate encrypted prefixes", async () => {
    const send = jest.spyOn(S3Client.prototype, "send").mockResolvedValue({} as never);
    const driver = getStorageDriver();

    const publicFile = await driver.store(Buffer.from("image"), "photo.png", "image/png");
    const privateFile = await driver.storePrivate(
      Buffer.from("%PDF-1.4"),
      "registration.pdf",
      "application/pdf"
    );

    expect(publicFile.url).toMatch(/^https:\/\/media\.balican\.test\/products\//);
    expect(privateFile.storageKey).toMatch(/^vetting\//);

    const publicInput = (send.mock.calls[0][0] as any).input;
    const privateInput = (send.mock.calls[1][0] as any).input;
    expect(publicInput).toMatchObject({
      Bucket: "balican-test",
      Key: expect.stringMatching(/^public\/products\//),
      ServerSideEncryption: "AES256",
    });
    expect(privateInput).toMatchObject({
      Bucket: "balican-test",
      Key: expect.stringMatching(/^private\/vetting\//),
      ServerSideEncryption: "AES256",
    });
  });

  test("creates short-lived signed access for private objects", async () => {
    const access = await getStorageDriver().getPrivateAccess(
      "vetting/document.pdf",
      "registration.pdf",
      "application/pdf"
    );

    const signedUrl = new URL(access!.redirectUrl!);
    expect(signedUrl.origin).toBe("https://objects.example.test");
    expect(signedUrl.pathname).toBe("/balican-test/private/vetting/document.pdf");
    expect(signedUrl.searchParams.get("X-Amz-Expires")).toBe("90");
    expect(signedUrl.searchParams.get("response-content-disposition")).toContain("registration.pdf");
  });

  test("imports an existing object without changing its storage key", async () => {
    const send = jest.spyOn(S3Client.prototype, "send").mockResolvedValue({} as never);

    await getStorageDriver().importExisting(
      "vetting/existing.pdf",
      Buffer.from("%PDF-1.4"),
      "application/pdf",
      true
    );

    expect((send.mock.calls[0][0] as any).input).toMatchObject({
      Bucket: "balican-test",
      Key: "private/vetting/existing.pdf",
      ServerSideEncryption: "AES256",
    });
  });
});
